'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import styles from './page.module.css';
import Tooltip from './components/Tooltip';
import { loadApiKey, saveApiKey, shouldRememberApiKey, clearApiKey } from './utils/apiKeyStorage';
import { exportToCSV, exportToJSON, exportToPDF, ExportableFlag } from './utils/export';

interface Project {
  key: string;
  name: string;
  environments?: {
    items?: Environment[];
  };
}

interface Environment {
  key: string;
  name: string;
}

interface FlagStatus {
  name: string;
  default: any;
  lastRequested?: string;
  _links?: {
    parent?: {
      href: string;
    };
  };
}

interface FlagDetail {
  key: string;
  name: string;
  variations?: any[];
  environments?: {
    [key: string]: {
      on: boolean;
      offVariation?: number;
      fallthrough?: {
        variation?: number;
      };
    };
  };
  deprecated?: boolean;
  archived?: boolean;
}

interface FlagDetailResult {
  flagStatus: FlagStatus;
  detail?: FlagDetail;
  error?: string;
}

interface ProgressState {
  current: number;
  total: number;
  operation: string;
  estimatedTimeRemaining?: number;
}

// Validate API key format
const isValidApiKey = (key: string) => {
  const apiKeyPattern = /^api-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return apiKeyPattern.test(key);
};

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [environment, setEnvironment] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<FlagDetailResult[]>([]);
  const [summary, setSummary] = useState({
    all: 0,
    launched: 0,
    active: 0,
    inactive: 0,
    mismatches: 0
  });
  const [filter, setFilter] = useState('all');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'lastEvaluated' | 'mismatch'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [rateLimitInfo, setRateLimitInfo] = useState<{ level: 'good' | 'warning' | 'danger'; message: string } | null>(null);
  const [partialResults, setPartialResults] = useState(false);

  // Mark as client-side after hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch projects when API key is entered
  const handleApiKeyBlur = useCallback(async (key?: string) => {
    const trimmedKey = (key || apiKey).trim();
    if (!trimmedKey) {
      return;
    }
    
    if (!isValidApiKey(trimmedKey)) {
      setError('Invalid API key format. Expected format: api-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
      setProjects([]);
      return;
    }
    
    // Save API key if remember is checked
    if (rememberApiKey) {
      try {
        await saveApiKey(trimmedKey, true);
      } catch (error) {
        console.error('Error saving API key:', error);
      }
    } else {
      clearApiKey();
    }
    
    setLoadingProjects(true);
    setError('');
    setProgress({
      current: 0,
      total: 1,
      operation: 'Fetching projects...'
    });
    
    try {
      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': trimmedKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      
      const data = await response.json();
      
      // Update progress with actual counts if available
      if (data.totalCount && data.loadedCount !== undefined) {
        setProgress({
          current: data.loadedCount,
          total: data.totalCount,
          operation: `Loading projects... (${data.loadedCount}/${data.totalCount})`
        });
      }
      
      setProjects(data.projects || []);
      
      // Update rate limit info if available
      if (data.rateLimitInfo) {
        const { getRateLimitStatus } = await import('./utils/rateLimitStatus');
        const status = getRateLimitStatus(data.rateLimitInfo);
        setRateLimitInfo(status);
      }
      
      // Show completion message
      const totalCount = data.totalCount || data.projects?.length || 0;
      setProgress({
        current: totalCount,
        total: totalCount,
        operation: `Loaded ${totalCount} project${totalCount !== 1 ? 's' : ''}`
      });
      
      // Clear progress after a short delay
      setTimeout(() => {
        setProgress(null);
      }, 1000);
    } catch (err: any) {
      console.error('Error fetching projects:', err);
      setError(err.message || 'Failed to fetch projects');
      setProjects([]);
      setProgress(null);
    } finally {
      setLoadingProjects(false);
    }
  }, [apiKey, rememberApiKey]);

  // Load API key from storage on mount (only on client)
  useEffect(() => {
    if (!isClient) return;
    
    const loadStoredApiKey = async () => {
      try {
        const stored = shouldRememberApiKey();
        setRememberApiKey(stored);
        
        if (stored) {
          const key = await loadApiKey();
          if (key) {
            setApiKey(key);
            // Auto-fetch projects if API key is loaded
            setTimeout(() => {
              handleApiKeyBlur(key);
            }, 100);
          }
        }
      } catch (error) {
        console.error('Error loading stored API key:', error);
      }
    };
    
    loadStoredApiKey();
  }, [isClient, handleApiKeyBlur]);

  // Handle remember API key checkbox change
  const handleRememberChange = async (checked: boolean) => {
    setRememberApiKey(checked);
    
    if (checked && apiKey.trim() && isValidApiKey(apiKey.trim())) {
      try {
        await saveApiKey(apiKey.trim(), true);
      } catch (error) {
        console.error('Error saving API key:', error);
        setError('Failed to save API key. Please try again.');
      }
    } else {
      clearApiKey();
    }
  };

  // Populate environments when project is selected
  useEffect(() => {
    if (projectKey && projects.length > 0) {
      const project = projects.find(p => p.key === projectKey);
      if (project) {
        const envs = project.environments?.items || [];
        setEnvironments(envs);
      } else {
        setEnvironments([]);
      }
    } else {
      setEnvironments([]);
    }
  }, [projectKey, projects]);

  // Run health check
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!apiKey.trim() || !projectKey.trim() || !environment.trim()) {
      setError('Please fill in all fields');
      return;
    }
    
    // Save API key if remember is checked
    if (rememberApiKey) {
      try {
        await saveApiKey(apiKey.trim(), true);
      } catch (error) {
        console.error('Error saving API key:', error);
      }
    }
    
    setLoading(true);
    setError('');
    setResults([]);
    setStartTime(Date.now());
    
    try {
      // Step 1: Fetch flag statuses
      setProgress({
        current: 0,
        total: 1,
        operation: 'Fetching flag statuses...'
      });
      
      const statusResponse = await fetch(
        `/api/flag-statuses?projectKey=${encodeURIComponent(projectKey)}&environment=${encodeURIComponent(environment)}`,
        {
          headers: {
            'Authorization': apiKey.trim(),
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!statusResponse.ok) {
        const errorData = await statusResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch flag statuses');
      }
      
      const statusData = await statusResponse.json();
      const flags = statusData.flags || [];
      
      // Update rate limit info if available
      if (statusData.rateLimitInfo) {
        const { getRateLimitStatus } = await import('./utils/rateLimitStatus');
        const status = getRateLimitStatus(statusData.rateLimitInfo);
        setRateLimitInfo(status);
      }
      
      if (flags.length === 0) {
        throw new Error('No flags found for this project and environment');
      }
      
      // Step 2: Fetch flag details in batch with progress simulation
      // Since the API processes in batches internally, we simulate progress
      const fetchStartTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - fetchStartTime;
        // Estimate: ~100ms per flag (conservative estimate)
        const estimatedTotalTime = flags.length * 100;
        const estimatedProgress = Math.min(Math.floor((elapsed / estimatedTotalTime) * flags.length), flags.length - 1);
        const estimatedRemaining = Math.max(0, Math.round((estimatedTotalTime - elapsed) / 1000));
        
        setProgress({
          current: estimatedProgress,
          total: flags.length,
          operation: `Fetching flag details... (${estimatedProgress}/${flags.length})`,
          estimatedTimeRemaining: estimatedRemaining > 0 ? estimatedRemaining : undefined
        });
      }, 200); // Update every 200ms
      
      const detailsResponse = await fetch('/api/flag-details-batch', {
        method: 'POST',
        headers: {
          'Authorization': apiKey.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ flags })
      });
      
      clearInterval(progressInterval);
      
      if (!detailsResponse.ok) {
        throw new Error('Failed to fetch flag details');
      }
      
      const detailsData = await detailsResponse.json();
      const flagDetails = detailsData.flagDetails || [];
      
      // Update rate limit info if available
      if (detailsData.rateLimitInfo) {
        const { getRateLimitStatus } = await import('./utils/rateLimitStatus');
        const status = getRateLimitStatus(detailsData.rateLimitInfo);
        setRateLimitInfo(status);
      }
      
      // Check for partial results
      if (detailsData.stats) {
        const { total, successful, errors } = detailsData.stats;
        if (errors > 0) {
          setPartialResults(true);
          setError(`Warning: ${errors} out of ${total} flags failed to load. Showing ${successful} successful results.`);
        }
      }
      
      // Step 3: Analyzing results
      setProgress({
        current: flags.length,
        total: flags.length,
        operation: 'Analyzing results...'
      });
      
      // Small delay to show the analyzing step
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Calculate summary and set results (even if partial)
      calculateSummary(flags, flagDetails, environment);
      setResults(flagDetails);
      
    } catch (err: any) {
      console.error('Health check error:', err);
      // If we have partial results, show them with a warning
      if (results.length > 0) {
        setPartialResults(true);
        setError(`Some flags failed to load: ${err.message || 'An error occurred during health check'}. Showing partial results.`);
      } else {
        setError(err.message || 'An error occurred during health check');
      }
    } finally {
      setLoading(false);
      setProgress(null);
      setStartTime(null);
    }
  };

  // Calculate summary statistics
  const calculateSummary = (flags: FlagStatus[], flagDetails: FlagDetailResult[], env: string) => {
    let launched = 0;
    let active = 0;
    let inactive = 0;
    let mismatches = 0;
    
    flagDetails.forEach(({ flagStatus, detail, error }) => {
      const status = flagStatus.name;
      const defaultValue = flagStatus.default;
      const isUnknownDefault = defaultValue === undefined;
      
      if (status === 'launched') launched++;
      else if (status === 'active') active++;
      else if (status === 'inactive') inactive++;
      
      const prodResult = detail ? getEnvironmentDefaultValue(detail, env) : { value: 'N/A', error: true };
      const isFallbackNull = defaultValue === null || defaultValue === undefined || isUnknownDefault;
      const hasMismatch = !isFallbackNull && !prodResult.error && !valuesMatch(defaultValue, prodResult.value);
      
      if (hasMismatch) mismatches++;
    });
    
    setSummary({
      all: flags.length,
      launched,
      active,
      inactive,
      mismatches
    });
  };

  // Get environment default value from flag detail
  const getEnvironmentDefaultValue = (detail: FlagDetail, environment: string) => {
    if (!detail || !detail.environments || !detail.environments[environment]) {
      return { value: 'N/A', error: true };
    }
    
    const env = detail.environments[environment];
    const variations = detail.variations || [];
    
    let variationIndex;
    
    if (env.on === true) {
      variationIndex = env.fallthrough?.variation;
    } else {
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
  };

  // Compare values
  const valuesMatch = (val1: any, val2: any) => {
    if (val1 === null || val1 === undefined) return val2 === null || val2 === undefined;
    if (val2 === null || val2 === undefined) return false;
    return val1 === val2;
  };

  // Format value for display
  const formatValue = (value: any, neverEvaluated: boolean = false) => {
    if (value === null || value === undefined) {
      return <span style={{ color: '#999', fontStyle: 'italic' }}>null</span>;
    }
    if (value === 'unknown') {
      const tooltipContent = neverEvaluated ? (
        <>
          <strong>Why is this unknown?</strong><br /><br />
          The fallback value is unknown because this flag has never been evaluated in your application.<br /><br />
          <strong>Recommendation:</strong> Evaluate individual feature flags with a fallback value to ensure proper functionality.<br /><br />
          <a href="https://launchdarkly.com/docs/sdk/features/evaluating" target="_blank" rel="noopener noreferrer">Learn about evaluating flags</a>
        </>
      ) : (
        <>
          <strong>Why is this unknown?</strong><br /><br />
          The SDK will not return a fallback value if the <code>allFlags()</code> method is used.<br /><br />
          <strong>Recommendation:</strong> Shift to evaluating individual feature flags and providing a fallback value.<br /><br />
          <a href="https://launchdarkly.com/docs/sdk/features/all-flags" target="_blank" rel="noopener noreferrer">Learn about allFlags()</a><br />
          <a href="https://launchdarkly.com/docs/sdk/features/evaluating" target="_blank" rel="noopener noreferrer">Learn about evaluating individual flags</a>
        </>
      );
      
      return (
        <Tooltip type="unknown" content={tooltipContent}>
          <span style={{ color: '#999', fontStyle: 'italic' }}>
            unknown
            <span style={{ marginLeft: '6px', fontSize: '14px', opacity: 0.7 }}>ℹ️</span>
          </span>
        </Tooltip>
      );
    }
    if (typeof value === 'string') {
      return `"${value}"`;
    }
    if (typeof value === 'object') {
      const jsonStr = JSON.stringify(value, null, 2);
      return <pre style={{ display: 'inline-block', margin: 0, padding: '8px', background: '#f5f5f5', borderRadius: '4px', fontSize: '0.9em' }}>{jsonStr}</pre>;
    }
    return String(value);
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Toggle card expansion
  const toggleCard = (flagKey: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(flagKey)) {
      newExpanded.delete(flagKey);
    } else {
      newExpanded.add(flagKey);
    }
    setExpandedCards(newExpanded);
  };

  // Filter flags
  const handleFilter = (filterType: string) => {
    setFilter(filterType);
  };

  // Get filtered, searched, and sorted results
  const getFilteredResults = useMemo(() => {
    let filtered = results;
    
    // Apply status/mismatch filter
    if (filter !== 'all') {
      if (filter === 'mismatch') {
        filtered = results.filter(({ flagStatus, detail, error }) => {
          const defaultValue = flagStatus.default;
          const isUnknownDefault = defaultValue === undefined;
          const prodResult = detail ? getEnvironmentDefaultValue(detail, environment) : { value: 'N/A', error: true };
          const isFallbackNull = defaultValue === null || defaultValue === undefined || isUnknownDefault;
          return !isFallbackNull && !prodResult.error && !valuesMatch(defaultValue, prodResult.value);
        });
      } else {
        filtered = results.filter(({ flagStatus }) => flagStatus.name === filter);
      }
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(({ flagStatus, detail }) => {
        const flagKey = detail?.key || flagStatus._links?.parent?.href?.split('/').pop() || '';
        const flagName = detail?.name || 'Unknown Flag';
        return flagKey.toLowerCase().includes(query) || flagName.toLowerCase().includes(query);
      });
    }
    
    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      const aKey = a.detail?.key || a.flagStatus._links?.parent?.href?.split('/').pop() || '';
      const bKey = b.detail?.key || b.flagStatus._links?.parent?.href?.split('/').pop() || '';
      const aName = a.detail?.name || 'Unknown Flag';
      const bName = b.detail?.name || 'Unknown Flag';
      const aStatus = a.flagStatus.name;
      const bStatus = b.flagStatus.name;
      const aLastEval = a.flagStatus.lastRequested ? new Date(a.flagStatus.lastRequested).getTime() : 0;
      const bLastEval = b.flagStatus.lastRequested ? new Date(b.flagStatus.lastRequested).getTime() : 0;
      
      const aHasMismatch = (() => {
        const defaultValue = a.flagStatus.default;
        const isUnknownDefault = defaultValue === undefined;
        const prodResult = a.detail ? getEnvironmentDefaultValue(a.detail, environment) : { value: 'N/A', error: true };
        const isFallbackNull = defaultValue === null || defaultValue === undefined || isUnknownDefault;
        return !isFallbackNull && !prodResult.error && !valuesMatch(defaultValue, prodResult.value);
      })();
      
      const bHasMismatch = (() => {
        const defaultValue = b.flagStatus.default;
        const isUnknownDefault = defaultValue === undefined;
        const prodResult = b.detail ? getEnvironmentDefaultValue(b.detail, environment) : { value: 'N/A', error: true };
        const isFallbackNull = defaultValue === null || defaultValue === undefined || isUnknownDefault;
        return !isFallbackNull && !prodResult.error && !valuesMatch(defaultValue, prodResult.value);
      })();
      
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = aName.localeCompare(bName);
          break;
        case 'status':
          comparison = aStatus.localeCompare(bStatus);
          break;
        case 'lastEvaluated':
          comparison = aLastEval - bLastEval;
          break;
        case 'mismatch':
          comparison = (aHasMismatch ? 1 : 0) - (bHasMismatch ? 1 : 0);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [results, filter, searchQuery, sortBy, sortOrder, environment]);

  // Export functions
  const handleExport = (format: 'csv' | 'json' | 'pdf') => {
    const exportableFlags: ExportableFlag[] = getFilteredResults.map(({ flagStatus, detail, error }) => {
      const flagKey = detail?.key || flagStatus._links?.parent?.href?.split('/').pop() || 'unknown';
      const flagName = detail?.name || 'Unknown Flag';
      const status = flagStatus.name;
      const defaultValue = flagStatus.default;
      const isUnknownDefault = defaultValue === undefined;
      const prodResult = detail ? getEnvironmentDefaultValue(detail, environment) : { value: 'N/A', error: true };
      const isFallbackNull = defaultValue === null || defaultValue === undefined || isUnknownDefault;
      const hasMismatch = !isFallbackNull && !prodResult.error && !valuesMatch(defaultValue, prodResult.value);
      
      let bcpHealth = 'Unknown';
      if (isFallbackNull || prodResult.error) {
        bcpHealth = 'Unable to Determine';
      } else if (hasMismatch) {
        bcpHealth = 'Mismatch';
      } else {
        bcpHealth = 'Match';
      }
      
      return {
        flagKey,
        flagName,
        status,
        fallbackValue: String(defaultValue ?? 'unknown'),
        environmentDefaultValue: String(prodResult.value ?? 'N/A'),
        bcpHealth,
        lastEvaluated: flagStatus.lastRequested ? new Date(flagStatus.lastRequested).toLocaleString() : 'Never',
        hasMismatch,
        variationName: prodResult.variationName
      };
    });
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `ld-flag-health-check-${projectKey}-${environment}-${timestamp}`;
    
    switch (format) {
      case 'csv':
        exportToCSV(exportableFlags, `${filename}.csv`);
        break;
      case 'json':
        exportToJSON(exportableFlags, `${filename}.json`);
        break;
      case 'pdf':
        exportToPDF(exportableFlags, projectKey, environment, summary, `${filename}.pdf`);
        break;
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>🚩 LaunchDarkly Flag Health Check</h1>
        <p className={styles.headerDescription}>Verify your feature flags are healthy and properly configured</p>
      </header>

      <div className={styles.configSection}>
        <h2 className={styles.configSectionTitle}>Configuration</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="apiKey" className={styles.formLabel}>
              LaunchDarkly API Key
              <span className={styles.recommendation}> (READ ONLY recommended)</span>
            </label>
            <input
              type="password"
              id="apiKey"
              className={styles.formInput}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => handleApiKeyBlur()}
              placeholder="api-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              required
            />
            <div className={styles.checkboxGroup}>
              <input
                type="checkbox"
                id="rememberApiKey"
                checked={rememberApiKey}
                onChange={(e) => handleRememberChange(e.target.checked)}
                className={styles.checkbox}
              />
              <label htmlFor="rememberApiKey" className={styles.checkboxLabel}>
                Remember API key (stored securely in browser)
              </label>
            </div>
            {rememberApiKey && (
              <div className={styles.securityWarning}>
                <span className={styles.warningIcon}>⚠️</span>
                <span className={styles.warningText}>
                  API key will be stored in your browser's localStorage with basic encryption. 
                  Only use this on trusted devices. Clear your browser data to remove stored keys.
                </span>
              </div>
            )}
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="projectKey" className={styles.formLabel}>Project Key (Searchable)</label>
              <input
                type="text"
                id="projectKey"
                className={styles.formInput}
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
                list="projectsList"
                placeholder={projects.length > 0 ? `Search or select a project... (${projects.length} available)` : 'Enter API key first...'}
                required
                disabled={projects.length === 0}
                autoComplete="off"
              />
              <datalist id="projectsList">
                {projects.map(project => (
                  <option key={project.key} value={project.key}>
                    {project.name} ({project.key})
                  </option>
                ))}
              </datalist>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="environment" className={styles.formLabel}>Environment (Searchable)</label>
              <input
                type="text"
                id="environment"
                className={styles.formInput}
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                list="environmentsList"
                placeholder={environments.length > 0 ? `Search or select an environment... (${environments.length} available)` : 'Select project first...'}
                required
                disabled={environments.length === 0}
                autoComplete="off"
              />
              <datalist id="environmentsList">
                {environments.map(env => (
                  <option key={env.key} value={env.key}>
                    {env.name} ({env.key})
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Running Health Check...' : 'Run Health Check'}
          </button>
        </form>
      </div>

      {(loading || loadingProjects) && (
        <div className={styles.loadingSection}>
          <div className={styles.spinner}></div>
          {progress ? (
            <div className={styles.progressContainer}>
              <p className={styles.progressOperation}>{progress.operation}</p>
              <div className={styles.progressBarContainer}>
                <div 
                  className={styles.progressBar}
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
              {progress.total > 1 && (
                <div className={styles.progressDetails}>
                  <span className={styles.progressText}>
                    {progress.current} / {progress.total} {progress.operation.includes('flags') ? 'flags' : 'items'}
                  </span>
                  {progress.estimatedTimeRemaining !== undefined && (
                    <span className={styles.progressTime}>
                      ~{progress.estimatedTimeRemaining}s remaining
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p>{loadingProjects ? 'Loading projects...' : 'Analyzing flags...'}</p>
          )}
        </div>
      )}

      {rateLimitInfo && (
        <div className={`${styles.rateLimitStatus} ${styles[`rateLimit${rateLimitInfo.level.charAt(0).toUpperCase() + rateLimitInfo.level.slice(1)}`]}`}>
          <span className={styles.rateLimitIcon}>
            {rateLimitInfo.level === 'danger' ? '🚨' : rateLimitInfo.level === 'warning' ? '⚠️' : '✅'}
          </span>
          <span>{rateLimitInfo.message}</span>
        </div>
      )}

      {error && (
        <div className={`${styles.errorSection} ${partialResults ? styles.warningSection : ''}`}>
          <div className={styles.errorMessage}>
            <span className={styles.errorIcon}>⚠️</span>
            <div>
              <strong className={styles.errorMessageTitle}>{partialResults ? 'Warning' : 'Error'}</strong>
              <p className={styles.errorMessageText}>{error}</p>
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className={styles.resultsSection}>
          <div className={styles.resultsHeader}>
            <div className={styles.resultsHeaderTop}>
              <div>
                <h2 className={styles.resultsHeaderTitle}>Health Check Results</h2>
                <p className={styles.resultsHeaderDescription}>💡 Click on summary boxes to filter results • Click on flag cards to expand/collapse details</p>
              </div>
              <div className={styles.exportButtons}>
                <button 
                  className={styles.exportBtn}
                  onClick={() => handleExport('csv')}
                  title="Export to CSV"
                >
                  📥 CSV
                </button>
                <button 
                  className={styles.exportBtn}
                  onClick={() => handleExport('json')}
                  title="Export to JSON"
                >
                  📥 JSON
                </button>
                <button 
                  className={styles.exportBtn}
                  onClick={() => handleExport('pdf')}
                  title="Export to PDF"
                >
                  📥 PDF
                </button>
              </div>
            </div>
            <div className={styles.searchAndSort}>
              <div className={styles.searchContainer}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search flags by name or key..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className={styles.clearSearch}
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className={styles.sortContainer}>
                <label htmlFor="sortBy" className={styles.sortLabel}>Sort by:</label>
                <select
                  id="sortBy"
                  className={styles.sortSelect}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="name">Name</option>
                  <option value="status">Status</option>
                  <option value="lastEvaluated">Last Evaluated</option>
                  <option value="mismatch">Mismatch</option>
                </select>
                <button
                  className={styles.sortOrderBtn}
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
            <div className={styles.summary}>
              <div 
                className={`${styles.summaryItem} ${styles.summaryAll} ${filter === 'all' ? styles.active : ''}`}
                onClick={() => handleFilter('all')}
              >
                📋 All: {summary.all}
              </div>
              <div 
                className={`${styles.summaryItem} ${styles.summaryLaunched} ${filter === 'launched' ? styles.active : ''}`}
                onClick={() => handleFilter('launched')}
              >
                🟢 Launched: {summary.launched}
              </div>
              <div 
                className={`${styles.summaryItem} ${styles.summaryActive} ${filter === 'active' ? styles.active : ''}`}
                onClick={() => handleFilter('active')}
              >
                🟡 Active: {summary.active}
              </div>
              <div 
                className={`${styles.summaryItem} ${styles.summaryInactive} ${filter === 'inactive' ? styles.active : ''}`}
                onClick={() => handleFilter('inactive')}
              >
                🔴 Inactive: {summary.inactive}
              </div>
              {summary.mismatches > 0 && (
                <div 
                  className={`${styles.summaryItem} ${styles.summaryMismatch} ${filter === 'mismatch' ? styles.active : ''}`}
                  onClick={() => handleFilter('mismatch')}
                >
                  ⚠️ Mismatches: {summary.mismatches}
                </div>
              )}
            </div>
          </div>
          {getFilteredResults.length === 0 && searchQuery && (
            <div className={styles.noResults}>
              <p>No flags found matching "{searchQuery}"</p>
            </div>
          )}
          <div className={styles.flagsList}>
            {getFilteredResults.map(({ flagStatus, detail, error: flagError }, index) => {
              const flagKey = detail?.key || flagStatus._links?.parent?.href?.split('/').pop() || `flag-${index}`;
              const status = flagStatus.name;
              const defaultValue = flagStatus.default;
              const isUnknownDefault = defaultValue === undefined;
              const prodResult = detail ? getEnvironmentDefaultValue(detail, environment) : { value: 'N/A', error: true };
              const isFallbackNull = defaultValue === null || defaultValue === undefined || isUnknownDefault;
              const hasMismatch = !isFallbackNull && !prodResult.error && !valuesMatch(defaultValue, prodResult.value);
              const isExpanded = expandedCards.has(flagKey);
              
              return (
                <div 
                  key={flagKey} 
                  className={`${styles.flagCard} ${hasMismatch ? styles.hasMismatch : ''} ${!isExpanded ? styles.collapsed : ''}`}
                >
                  <div className={styles.flagHeader} onClick={() => toggleCard(flagKey)}>
                    <div className={styles.flagTitle}>
                      <h3 className={styles.flagTitleHeading}>
                        <span className={styles.collapseIcon}>{isExpanded ? '▼' : '▶'}</span>
                        {detail?.name || 'Unknown Flag'}
                        <a 
                          href={`https://app.launchdarkly.com/projects/${projectKey}/flags/${flagKey}?env=${environment}&selected-env=${environment}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.flagLink}
                          onClick={(e) => e.stopPropagation()}
                          title="View in LaunchDarkly"
                        >
                          🔗
                        </a>
                      </h3>
                      <div className={styles.flagKey}>{flagKey}</div>
                    </div>
                    <div className={styles.flagBadges}>
                      {status === 'launched' && <span className={`${styles.badge} ${styles.badgeLaunched}`}>🟢 Launched</span>}
                      {status === 'active' && <span className={`${styles.badge} ${styles.badgeActive}`}>🟡 Active</span>}
                      {status === 'active' && <span className={`${styles.badge} ${styles.badgeNeedsReview}`}>🔔 Needs Review</span>}
                      {status === 'inactive' && <span className={`${styles.badge} ${styles.badgeInactive}`}>🔴 Inactive</span>}
                      {hasMismatch && <span className={styles.badge} style={{ background: '#ffe5e5', color: '#d63031' }}>⚠️ MISMATCH</span>}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className={styles.flagContent}>
                      {flagError ? (
                        <div className={styles.mismatchWarning}>
                          <strong className={styles.mismatchWarningTitle}>⚠️ Error Loading Flag Details</strong>
                          <p className={styles.mismatchWarningText}>{flagError}</p>
                        </div>
                      ) : (
                        <>
                          <div className={styles.flagDetails}>
                            <div className={styles.detailRow}>
                              <span className={styles.detailLabel}>Fallback Value (from your code):</span>
                              <span className={styles.detailValue}>{formatValue(defaultValue, !flagStatus.lastRequested)}</span>
                            </div>
                            <div className={styles.detailRow}>
                              <span className={styles.detailLabel}>Environment Default Value:</span>
                              <span className={styles.detailValue}>{formatValue(prodResult.value, false)}</span>
                            </div>
                            <div className={styles.detailRow}>
                              <span className={styles.detailLabel}>BCP Health:</span>
                              <span className={styles.detailValue}>
                                {isFallbackNull ? (
                                  <Tooltip 
                                    type="unknown"
                                    content={
                                      <>
                                        <strong>Unable to Compare Values</strong><br /><br />
                                        Your default rule is likely doing a percentage rollout, experiment, or guarded rollout, which means different users may receive different variations.<br /><br />
                                        This tool compares static fallback values with default rules, so dynamic targeting strategies cannot be directly compared.
                                      </>
                                    }
                                  >
                                    <span className={styles.valueUnknown}>❓ Unable to Determine</span>
                                  </Tooltip>
                                ) : prodResult.error ? (
                                  <Tooltip 
                                    type="unknown"
                                    content={
                                      <>
                                        <strong>Unable to Retrieve Environment Value</strong><br /><br />
                                        Your default rule is likely doing a percentage rollout, experiment, or guarded rollout, which means different users may receive different variations.<br /><br />
                                        This tool compares static fallback values with default rules, so dynamic targeting strategies cannot be directly compared.
                                      </>
                                    }
                                  >
                                    <span className={styles.valueUnknown}>❓ Unable to Determine</span>
                                  </Tooltip>
                                ) : hasMismatch ? (
                                  <Tooltip 
                                    type="mismatch"
                                    content={
                                      <>
                                        <strong>⚠️ Configuration Mismatch Detected</strong><br /><br />
                                        The fallback value in your code does not match the value in the default rule on the LaunchDarkly feature flag UI.<br /><br />
                                        <strong>Risk:</strong> In the event of a LaunchDarkly outage or connectivity issue, your application will use the fallback value from your code, which differs from the expected default behavior. This may result in a negative customer experience.<br /><br />
                                        <strong>Recommendation:</strong> Update either your code's fallback value or the default rule in LaunchDarkly to ensure they match.
                                      </>
                                    }
                                  >
                                    <span className={styles.valueMismatch}>⚠️ MISMATCH</span>
                                  </Tooltip>
                                ) : (
                                  <Tooltip 
                                    type="match"
                                    content={
                                      <>
                                        <strong>✅ Excellent Configuration!</strong><br /><br />
                                        Your fallback value in code matches the default rule in LaunchDarkly perfectly.<br /><br />
                                        <strong>Benefit:</strong> In the event of a LaunchDarkly outage or connectivity issue, your customers will experience consistent behavior, as your application's fallback value aligns with the expected default.<br /><br />
                                        <strong>Best Practice:</strong> Keep maintaining this consistency to ensure reliable feature flag operations and optimal customer experience!
                                      </>
                                    }
                                  >
                                    <span className={styles.valueMatch}>✓ Match</span>
                                  </Tooltip>
                                )}
                              </span>
                            </div>
                            {prodResult.variationName && (
                              <div className={styles.detailRow}>
                                <span className={styles.detailLabel}>Environment Default Label:</span>
                                <span className={styles.detailValue}>{prodResult.variationName} (index: {prodResult.variationIndex})</span>
                              </div>
                            )}
                            <div className={styles.detailRow}>
                              <span className={styles.detailLabel}>Last evaluation:</span>
                              <span className={styles.detailValue}>{formatDate(flagStatus.lastRequested)}</span>
                            </div>
                          </div>
                          {hasMismatch && (
                            <div className={styles.mismatchWarning}>
                              <strong className={styles.mismatchWarningTitle}>⚠️ Configuration Mismatch Detected</strong>
                              <p className={styles.mismatchWarningText}>The fallback value in your code ({formatValue(defaultValue)}) does not match the environment default rule ({formatValue(prodResult.value)}).</p>
                            </div>
                          )}
                          {(detail?.deprecated || detail?.archived) && (
                            <div className={styles.flagMeta}>
                              {detail?.deprecated && <span className={styles.flagMetaItem} style={{ color: '#f44336' }}>⚠️ DEPRECATED</span>}
                              {detail?.archived && <span className={styles.flagMetaItem} style={{ color: '#f44336' }}>📦 ARCHIVED</span>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

