// LaunchDarkly API base URL - direct browser calls
const LD_API_BASE = 'https://app.launchdarkly.com/api/v2';

// Rate Limit Manager - tracks API rate limits
const RateLimitManager = {
    globalRemaining: null,
    routeRemaining: null,
    resetTime: null,
    
    updateFromHeaders(headers) {
        // Try multiple header name variations (case-insensitive)
        const globalRemaining = headers.get('X-Ratelimit-Global-Remaining') 
            || headers.get('x-ratelimit-global-remaining')
            || headers.get('X-RateLimit-Global-Remaining')
            || headers.get('RateLimit-Global-Remaining');
            
        const routeRemaining = headers.get('X-Ratelimit-Route-Remaining')
            || headers.get('x-ratelimit-route-remaining')
            || headers.get('X-RateLimit-Route-Remaining')
            || headers.get('RateLimit-Route-Remaining');
            
        const resetTime = headers.get('X-Ratelimit-Reset')
            || headers.get('x-ratelimit-reset')
            || headers.get('X-RateLimit-Reset')
            || headers.get('RateLimit-Reset');
        
        this.globalRemaining = globalRemaining ? parseInt(globalRemaining) : null;
        this.routeRemaining = routeRemaining ? parseInt(routeRemaining) : null;
        this.resetTime = resetTime ? parseInt(resetTime) : null;
        
        // Update UI
        this.updateUI();
    },
    
    updateUI() {
        const container = document.getElementById('rateLimitStatus');
        if (!container) return;
        
        // Check if rate limit data is available
        const hasRateLimitData = this.globalRemaining !== null || this.routeRemaining !== null;
        
        if (!hasRateLimitData) {
            // Show informational message about CORS limitation
            if (!this._corsWarningShown) {
                this._corsWarningShown = true;
                container.className = 'rate-limit-status rate-limit-info';
                container.innerHTML = `
                    <span class="rate-limit-icon">ℹ️</span>
                    <span>Rate limit headers not accessible from browser (CORS restriction)</span>
                    <span class="rate-limit-details" style="font-size: 0.75em;">Batching enabled to prevent rate limit issues</span>
                `;
                container.style.display = 'flex';
                
                // Hide after 10 seconds
                setTimeout(() => {
                    container.style.display = 'none';
                }, 10000);
            }
            return;
        }
        
        const lowest = Math.min(
            this.globalRemaining !== null ? this.globalRemaining : Infinity,
            this.routeRemaining !== null ? this.routeRemaining : Infinity
        );
        
        if (!isFinite(lowest)) {
            container.style.display = 'none';
            return;
        }
        
        const secondsUntilReset = this.resetTime 
            ? Math.max(0, Math.floor((this.resetTime - Date.now()) / 1000))
            : 0;
        
        // Determine status color
        let statusClass = 'rate-limit-good';
        let statusIcon = '✅';
        if (lowest < 50) {
            statusClass = 'rate-limit-warning';
            statusIcon = '⚠️';
        }
        if (lowest < 20) {
            statusClass = 'rate-limit-danger';
            statusIcon = '🚨';
        }
        
        container.className = `rate-limit-status ${statusClass}`;
        container.innerHTML = `
            <span class="rate-limit-icon">${statusIcon}</span>
            <span>API Calls: <strong>${lowest}</strong> remaining</span>
            <span class="rate-limit-reset">Resets in ${secondsUntilReset}s</span>
            <span class="rate-limit-details">(Global: ${this.globalRemaining} | Route: ${this.routeRemaining})</span>
        `;
        container.style.display = 'flex';
    },
    
    shouldThrottle() {
        if (this.globalRemaining === null && this.routeRemaining === null) {
            return false;
        }
        const lowest = Math.min(
            this.globalRemaining !== null ? this.globalRemaining : Infinity,
            this.routeRemaining !== null ? this.routeRemaining : Infinity
        );
        return isFinite(lowest) && lowest < 10; // Throttle if less than 10 requests remaining
    },
    
    async waitIfNeeded() {
        if (this.shouldThrottle() && this.resetTime) {
            const waitTime = Math.max(0, this.resetTime - Date.now() + 100); // Add 100ms buffer
            if (waitTime > 0 && waitTime < 15000) { // Only wait up to 15 seconds
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
};

// Enhanced fetch with rate limit tracking and retry logic
async function fetchWithRateLimit(url, options, retries = 3) {
    // Wait if we're close to rate limit
    await RateLimitManager.waitIfNeeded();
    
    try {
        const response = await fetch(url, options);
        
        // Update rate limit info from headers
        RateLimitManager.updateFromHeaders(response.headers);
        
        // Handle 429 Too Many Requests
        if (response.status === 429) {
            if (retries > 0) {
                const retryAfter = response.headers.get('Retry-After') || 2;
                const waitTime = parseInt(retryAfter) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return fetchWithRateLimit(url, options, retries - 1);
            } else {
                throw new Error('Rate limit exceeded. Please wait and try again.');
            }
        }
        
        return response;
    } catch (error) {
        if (retries > 0 && error.name === 'TypeError') {
            // Network error, retry with exponential backoff
            const waitTime = (4 - retries) * 1000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return fetchWithRateLimit(url, options, retries - 1);
        }
        throw error;
    }
}

// DOM Elements
const form = document.getElementById('healthCheckForm');
const loadingSection = document.getElementById('loadingSection');
const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');
const flagsList = document.getElementById('flagsList');
const summary = document.getElementById('summary');
const checkBtn = document.getElementById('checkBtn');
const apiKeyInput = document.getElementById('apiKey');
const projectKeyInput = document.getElementById('projectKey');
const environmentInput = document.getElementById('environment');
const projectsList = document.getElementById('projectsList');
const environmentsList = document.getElementById('environmentsList');

// Store projects data
let projectsData = [];
let currentProjectKey = '';
let currentEnvironment = '';

// Validate API key format
function isValidApiKey(apiKey) {
    // API keys should match format: api-{UUID}
    // Example: api-2c3d5a6b-7ba6-4c4f-a019-5621a27a9dbb
    const apiKeyPattern = /^api-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return apiKeyPattern.test(apiKey);
}

// API Key input handler - fetch projects when API key is entered
apiKeyInput.addEventListener('blur', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        return;
    }
    
    if (!isValidApiKey(apiKey)) {
        showError('Invalid API key format. Expected format: api-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
        projectKeyInput.disabled = true;
        projectKeyInput.placeholder = 'Enter valid API key first...';
        projectsList.innerHTML = '';
        return;
    }
    
    await fetchAndPopulateProjects(apiKey);
});

// Project input handler - populate environments when project is selected/typed
projectKeyInput.addEventListener('input', () => {
    const selectedProjectKey = projectKeyInput.value.trim();
    
    // Check if the entered value matches a project key
    const project = projectsData.find(p => p.key === selectedProjectKey);
    
    if (project && selectedProjectKey !== currentProjectKey) {
        currentProjectKey = selectedProjectKey;
        populateEnvironments(selectedProjectKey);
    } else if (!project && selectedProjectKey !== currentProjectKey) {
        // Reset environment dropdown if invalid project
        currentProjectKey = '';
        environmentInput.value = '';
        environmentInput.placeholder = 'Select a valid project first...';
        environmentInput.disabled = true;
        environmentsList.innerHTML = '';
    }
});

// Fetch projects from API and populate datalist
async function fetchAndPopulateProjects(apiKey) {
    try {
        projectKeyInput.disabled = true;
        projectKeyInput.placeholder = 'Loading projects...';
        
        // Fetch all projects by handling pagination
        let allProjects = [];
        let offset = 0;
        const limit = 20;
        let hasMore = true;

        while (hasMore) {
            const url = `${LD_API_BASE}/projects?limit=${limit}&offset=${offset}&expand=environments`;
            
            const response = await fetchWithRateLimit(url, {
                headers: {
                    'Authorization': apiKey,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch projects');
            }
            
            const data = await response.json();
            const projects = data.items || [];
            allProjects = allProjects.concat(projects);
            
            const totalCount = data.totalCount;
            offset += limit;
            hasMore = offset < totalCount;
        }
        
        projectsData = allProjects;
        
        if (projectsData.length === 0) {
            projectKeyInput.placeholder = 'No projects found';
            return;
        }
        
        // Populate project datalist
        projectsList.innerHTML = '';
        projectsData.forEach(project => {
            const option = document.createElement('option');
            option.value = project.key;
            option.textContent = `${project.name} (${project.key})`;
            projectsList.appendChild(option);
        });
        
        projectKeyInput.placeholder = `Search or select a project... (${projectsData.length} available)`;
        projectKeyInput.disabled = false;
        projectKeyInput.value = '';
        
    } catch (error) {
        console.error('Error fetching projects:', error);
        projectKeyInput.placeholder = 'Error loading projects';
    }
}

// Populate environments datalist based on selected project
function populateEnvironments(projectKey) {
    console.log('Populating environments for project:', projectKey);
    const project = projectsData.find(p => p.key === projectKey);
    
    if (!project) {
        console.error('Project not found:', projectKey);
        environmentInput.placeholder = 'Project not found';
        environmentInput.disabled = true;
        environmentsList.innerHTML = '';
        return;
    }
    
    // Environments are nested under environments.items when using expand parameter
    const environments = project.environments?.items || [];
    
    if (environments.length === 0) {
        console.warn('No environments found for project:', projectKey);
        environmentInput.placeholder = 'No environments found';
        environmentInput.disabled = true;
        environmentsList.innerHTML = '';
        return;
    }
    
    console.log('Found environments:', environments.length);
    environmentsList.innerHTML = '';
    environments.forEach(env => {
        const option = document.createElement('option');
        option.value = env.key;
        option.textContent = `${env.name} (${env.key})`;
        environmentsList.appendChild(option);
    });
    
    environmentInput.placeholder = `Search or select an environment... (${environments.length} available)`;
    environmentInput.disabled = false;
    environmentInput.value = '';
}

// Form submission handler
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const apiKey = apiKeyInput.value.trim();
    const projectKey = projectKeyInput.value.trim();
    const environment = environmentInput.value.trim();
    
    await runHealthCheck(apiKey, projectKey, environment);
});

// Main health check function
async function runHealthCheck(apiKey, projectKey, environment) {
    // Store current values
    currentProjectKey = projectKey;
    currentEnvironment = environment;
    
    // Reset UI
    hideError();
    hideResults();
    showLoading();
    checkBtn.disabled = true;
    
    try {
        // Step 1: Fetch flag statuses directly from LaunchDarkly
        const statusResponse = await fetchWithRateLimit(`${LD_API_BASE}/flag-statuses/${projectKey}/${environment}`, {
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            }
        });
        
        if (!statusResponse.ok) {
            const error = await statusResponse.json().catch(() => ({}));
            throw new Error(error.message || 'Failed to fetch flag statuses');
        }
        
        const statusData = await statusResponse.json();
        const flags = statusData.items || [];
        
        if (flags.length === 0) {
            throw new Error('No flags found for this project and environment');
        }
        
        // Update loading message with flag count
        const loadingProgress = document.getElementById('loadingProgress');
        if (loadingProgress) {
            loadingProgress.textContent = `Found ${flags.length} flags. Fetching details...`;
        }
        
        // Step 2: Fetch details for each flag with batching and progress
        const flagDetails = await fetchFlagDetailsBatched(apiKey, flags, (processed, total) => {
            if (loadingProgress) {
                loadingProgress.textContent = `Fetching flag details: ${processed}/${total}...`;
            }
        });
        
        // Step 3: Analyze and display results
        displayResults(flags, flagDetails, environment);
        
    } catch (error) {
        console.error('Health check error:', error);
        showError(error.message);
    } finally {
        hideLoading();
        checkBtn.disabled = false;
    }
}

// Fetch individual flag detail
async function fetchFlagDetail(apiKey, flagStatus) {
    try {
        const flagUrl = flagStatus._links?.parent?.href;
        
        if (!flagUrl) {
            return { error: 'No detail URL found', flagStatus };
        }
        
        // flagUrl is already a full path like /api/v2/flags/project-key/flag-key
        // We need to prepend the base URL
        const fullUrl = `https://app.launchdarkly.com${flagUrl}`;
        
        const response = await fetchWithRateLimit(fullUrl, {
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            return { error: 'Failed to fetch detail', flagStatus };
        }
        
        const detail = await response.json();
        return { detail, flagStatus };
        
    } catch (error) {
        console.error('Error fetching flag detail:', error);
        return { error: error.message, flagStatus };
    }
}

// Batched flag detail fetching with progress indicator
async function fetchFlagDetailsBatched(apiKey, flags, onProgress) {
    const batchSize = 15; // Process 15 flags at a time to avoid overwhelming the API
    const results = [];
    
    for (let i = 0; i < flags.length; i += batchSize) {
        const batch = flags.slice(i, i + batchSize);
        const batchPromises = batch.map(flag => fetchFlagDetail(apiKey, flag));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Update progress
        const processed = Math.min(i + batchSize, flags.length);
        if (onProgress) {
            onProgress(processed, flags.length);
        }
        
        // Small delay between batches to be nice to API (except for last batch)
        if (i + batchSize < flags.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

// Get environment default value from flag detail
function getEnvironmentDefaultValue(detail, environment = 'production') {
    if (!detail || !detail.environments || !detail.environments[environment]) {
        return { value: 'N/A', error: true };
    }
    
    const env = detail.environments[environment];
    const variations = detail.variations || [];
    
    let variationIndex;
    
    if (env.on === true) {
        // Flag is ON → use fallthrough variation
        variationIndex = env.fallthrough?.variation;
    } else {
        // Flag is OFF → use offVariation
        variationIndex = env.offVariation;
    }
    
    if (variationIndex === undefined || variationIndex === null) {
        return { value: 'N/A', error: true };
    }
    
    const variation = variations[variationIndex];
    
    if (!variation) {
        return { value: 'N/A', error: true };
    }
    
    return { 
        value: variation.value, 
        error: false,
        isOn: env.on,
        variationIndex,
        variationName: variation.name
    };
}

// Display results
function displayResults(flags, flagDetails, environment) {
    let launched = 0;
    let active = 0;
    let inactive = 0;
    let mismatches = 0;
    
    flagsList.innerHTML = '';
    
    flagDetails.forEach(({ flagStatus, detail, error }) => {
        const status = flagStatus.name;
        const defaultValue = flagStatus.default;
        const isUnknownDefault = defaultValue === undefined;
        
        // Count statuses
        if (status === 'launched') launched++;
        else if (status === 'active') active++;
        else if (status === 'inactive') inactive++;
        
        // Get environment default value
        const prodResult = detail ? getEnvironmentDefaultValue(detail, environment) : { value: 'N/A', error: true };
        
        // Only count as mismatch if:
        // 1. Fallback value is NOT null/undefined
        // 2. Environment default was successfully retrieved (no error)
        // 3. Values don't match
        const isFallbackNull = defaultValue === null || defaultValue === undefined || isUnknownDefault;
        const hasMismatch = !isFallbackNull && !prodResult.error && !valuesMatch(defaultValue, prodResult.value);
        
        if (hasMismatch) mismatches++;
        
        // Create flag card
        const flagCard = createFlagCard(flagStatus, detail, prodResult, hasMismatch, error, isUnknownDefault);
        flagsList.appendChild(flagCard);
    });
    
    // Update summary
    summary.innerHTML = `
        <div class="summary-item summary-all active" onclick="filterFlags('all')">📋 All: ${flags.length}</div>
        <div class="summary-item summary-launched" onclick="filterFlags('launched')">🟢 Launched: ${launched}</div>
        <div class="summary-item summary-active" onclick="filterFlags('active')">🟡 Active: ${active}</div>
        <div class="summary-item summary-inactive" onclick="filterFlags('inactive')">🔴 Inactive: ${inactive}</div>
        ${mismatches > 0 ? `<div class="summary-item summary-mismatch" onclick="filterFlags('mismatch')">⚠️ Mismatches: ${mismatches}</div>` : ''}
    `;
    
    showResults();
}

// Create flag card HTML
function createFlagCard(flagStatus, detail, prodResult, hasMismatch, error, isUnknownDefault = false) {
    const card = document.createElement('div');
    card.className = `flag-card ${hasMismatch ? 'has-mismatch' : ''} collapsed`;
    
    const status = flagStatus.name;
    
    // Add data attributes for filtering
    card.setAttribute('data-status', status);
    card.setAttribute('data-has-mismatch', hasMismatch ? 'true' : 'false');
    const defaultValue = isUnknownDefault ? 'unknown' : flagStatus.default;
    const flagKey = detail?.key || extractFlagKey(flagStatus);
    
    // Status badge
    let statusBadge = '';
    if (status === 'launched') {
        statusBadge = '<span class="badge badge-launched">🟢 Launched</span>';
    } else if (status === 'active') {
        statusBadge = '<span class="badge badge-active">🟡 Active</span>';
    } else if (status === 'inactive') {
        statusBadge = '<span class="badge badge-inactive">🔴 Inactive</span>';
    }
    
    // Needs review badge for active flags
    const needsReviewBadge = status === 'active' 
        ? '<span class="badge badge-needs-review">🔔 Needs Review</span>' 
        : '';
    
    // Format values
    const neverEvaluated = !flagStatus.lastRequested;
    const defaultValueStr = formatValue(defaultValue, neverEvaluated);
    const prodValueStr = formatValue(prodResult.value, false);
    
    // Check if fallback value is null or undefined (can't make valid comparison)
    const isFallbackNull = defaultValue === null || defaultValue === undefined || isUnknownDefault;
    
    // Match indicator
    const matchIndicator = isFallbackNull
        ? `<span class="value-unknown">❓ Unable to Determine</span>
           <span class="info-tooltip unknown-tooltip">
               <span class="tooltip-icon">ℹ️</span>
               <span class="tooltip-content">
                   <strong>Unable to Compare Values</strong><br><br>
                   Your default rule is likely doing a percentage rollout, experiment, or guarded rollout, which means different users may receive different variations.<br><br>
                   This tool compares static fallback values with default rules, so dynamic targeting strategies cannot be directly compared.
               </span>
           </span>`
        : prodResult.error
            ? `<span class="value-unknown">❓ Unable to Determine</span>
               <span class="info-tooltip unknown-tooltip">
                   <span class="tooltip-icon">ℹ️</span>
                   <span class="tooltip-content">
                   <strong>Unable to Retrieve Environment Value</strong><br><br>
                   Your default rule is likely doing a percentage rollout, experiment, or guarded rollout, which means different users may receive different variations.<br><br>
                   This tool compares static fallback values with default rules, so dynamic targeting strategies cannot be directly compared.
               </span>
           </span>`
            : (hasMismatch 
                ? `<span class="value-mismatch">⚠️ MISMATCH</span>
                   <span class="info-tooltip mismatch-tooltip">
                       <span class="tooltip-icon">ℹ️</span>
                       <span class="tooltip-content">
                           <strong>⚠️ Configuration Mismatch Detected</strong><br><br>
                           The fallback value in your code does not match the value in the default rule on the LaunchDarkly feature flag UI.<br><br>
                           <strong>Risk:</strong> In the event of a LaunchDarkly outage or connectivity issue, your application will use the fallback value from your code, which differs from the expected default behavior. This may result in a negative customer experience.<br><br>
                           <strong>Recommendation:</strong> Update either your code's fallback value or the default rule in LaunchDarkly to ensure they match.
                       </span>
                   </span>` 
                : `<span class="value-match">✓ Match</span>
                   <span class="info-tooltip match-tooltip">
                       <span class="tooltip-icon">ℹ️</span>
                       <span class="tooltip-content">
                           <strong>✅ Excellent Configuration!</strong><br><br>
                           Your fallback value in code matches the default rule in LaunchDarkly perfectly.<br><br>
                           <strong>Benefit:</strong> In the event of a LaunchDarkly outage or connectivity issue, your customers will experience consistent behavior, as your application's fallback value aligns with the expected default.<br><br>
                           <strong>Best Practice:</strong> Keep maintaining this consistency to ensure reliable feature flag operations and optimal customer experience!
                       </span>
                   </span>`);
    
    card.innerHTML = `
        <div class="flag-header" onclick="toggleCard(this)">
            <div class="flag-title">
                <h3>
                    <span class="collapse-icon">▶</span>
                    ${detail?.name || 'Unknown Flag'}
                    <a href="https://app.launchdarkly.com/projects/${currentProjectKey}/flags/${flagKey}?env=${currentEnvironment}&selected-env=${currentEnvironment}" 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       class="flag-link"
                       onclick="event.stopPropagation();"
                       title="View in LaunchDarkly">
                        🔗
                    </a>
                </h3>
                <div class="flag-key">${flagKey}</div>
            </div>
            <div class="flag-badges">
                ${statusBadge}
                ${needsReviewBadge}
                ${hasMismatch ? '<span class="badge" style="background: #ffe5e5; color: #d63031;">⚠️ MISMATCH</span>' : ''}
            </div>
        </div>
        <div class="flag-content">
        ${error ? `
            <div class="mismatch-warning">
                <strong>⚠️ Error Loading Flag Details</strong>
                <p>${error}</p>
            </div>
        ` : `
            <div class="flag-details">
                <div class="detail-row">
                    <span class="detail-label">Fallback Value (from your code):</span>
                    <span class="detail-value">${defaultValueStr}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Environment Default Value:</span>
                    <span class="detail-value">${prodValueStr}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">BCP Health:</span>
                    <span class="detail-value">${matchIndicator}</span>
                </div>
                ${prodResult.variationName ? `
                    <div class="detail-row">
                        <span class="detail-label">Environment Default Label:</span>
                        <span class="detail-value">${prodResult.variationName} (index: ${prodResult.variationIndex})</span>
                    </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-label">Last evaluation:</span>
                    <span class="detail-value">${flagStatus.lastRequested ? formatDate(flagStatus.lastRequested) : 'Never'}</span>
                </div>
            </div>
            
            ${hasMismatch ? `
                <div class="mismatch-warning">
                    <strong>⚠️ Configuration Mismatch Detected</strong>
                    <p>The fallback value in your code (${defaultValueStr}) does not match the environment default rule (${prodValueStr}).</p>
                </div>
            ` : ''}
        `}
        
        ${detail?.deprecated || detail?.archived ? `
        <div class="flag-meta">
            ${detail?.deprecated ? '<span style="color: #f44336;">⚠️ DEPRECATED</span>' : ''}
            ${detail?.archived ? '<span style="color: #f44336;">📦 ARCHIVED</span>' : ''}
        </div>
        ` : ''}
        </div>
    `;
    
    return card;
}

// Helper: Extract flag key from status links
function extractFlagKey(flagStatus) {
    const href = flagStatus._links?.parent?.href;
    if (href) {
        const parts = href.split('/');
        return parts[parts.length - 1];
    }
    return 'unknown';
}

// Helper: Format value for display
function formatValue(value, neverEvaluated = false) {
    if (value === null || value === undefined) {
        return '<span style="color: #999; font-style: italic;">null</span>';
    }
    if (value === 'unknown') {
        // Different tooltip content based on whether flag was never evaluated
        const tooltipContent = neverEvaluated ? `
            <strong>Why is this unknown?</strong><br><br>
            The fallback value is unknown because this flag has never been evaluated in your application.<br><br>
            <strong>Recommendation:</strong> Evaluate individual feature flags with a fallback value to ensure proper functionality.<br><br>
            <a href="https://launchdarkly.com/docs/sdk/features/evaluating" target="_blank" rel="noopener noreferrer">Learn about evaluating flags</a>
        ` : `
            <strong>Why is this unknown?</strong><br><br>
            The SDK will not return a fallback value if the <code>allFlags()</code> method is used.<br><br>
            <strong>Recommendation:</strong> Shift to evaluating individual feature flags and providing a fallback value.<br><br>
            <a href="https://launchdarkly.com/docs/sdk/features/all-flags" target="_blank" rel="noopener noreferrer">Learn about allFlags()</a><br>
            <a href="https://launchdarkly.com/docs/sdk/features/evaluating" target="_blank" rel="noopener noreferrer">Learn about evaluating individual flags</a>
        `;
        
        return `<span style="color: #999; font-style: italic;">unknown</span>
                <span class="info-tooltip">
                    <span class="tooltip-icon">ℹ️</span>
                    <span class="tooltip-content">${tooltipContent}</span>
                </span>`;
    }
    if (typeof value === 'string') {
        return `"${value}"`;
    }
    if (typeof value === 'object') {
        // Format objects and arrays as pretty JSON
        const jsonStr = JSON.stringify(value, null, 2);
        return `<pre style="display: inline-block; margin: 0; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 0.9em;">${jsonStr}</pre>`;
    }
    return String(value);
}

// Helper: Format date
function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Helper: Compare values (handles different types)
function valuesMatch(val1, val2) {
    // Handle null/undefined
    if (val1 === null || val1 === undefined) return val2 === null || val2 === undefined;
    if (val2 === null || val2 === undefined) return false;
    
    // Direct comparison
    return val1 === val2;
}

// UI Helper functions
function showLoading() {
    loadingSection.style.display = 'block';
}

function hideLoading() {
    loadingSection.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
}

function hideError() {
    errorSection.style.display = 'none';
}

function showResults() {
    resultsSection.style.display = 'block';
}

function hideResults() {
    resultsSection.style.display = 'none';
}

// Toggle flag card collapse/expand
function toggleCard(header) {
    const card = header.parentElement;
    const icon = card.querySelector('.collapse-icon');
    
    card.classList.toggle('collapsed');
    
    if (card.classList.contains('collapsed')) {
        icon.textContent = '▶';
    } else {
        icon.textContent = '▼';
    }
}

// Filter flags by status or mismatch
function filterFlags(filterType) {
    const allCards = document.querySelectorAll('.flag-card');
    const summaryItems = document.querySelectorAll('.summary-item');
    
    // Update active state on summary items
    summaryItems.forEach(item => item.classList.remove('active'));
    
    // Show/hide cards based on filter
    allCards.forEach(card => {
        let shouldShow = false;
        
        if (filterType === 'all') {
            shouldShow = true;
        } else if (filterType === 'mismatch') {
            shouldShow = card.getAttribute('data-has-mismatch') === 'true';
        } else {
            shouldShow = card.getAttribute('data-status') === filterType;
        }
        
        if (shouldShow) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
    
    // Highlight active filter
    const activeFilter = Array.from(summaryItems).find(item => {
        const onclick = item.getAttribute('onclick');
        return onclick && onclick.includes(`'${filterType}'`);
    });
    
    if (activeFilter) {
        activeFilter.classList.add('active');
    }
}

