# LaunchDarkly Flag Health Check

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A browser-based tool for checking LaunchDarkly feature flag health by comparing fallback values with environment default rules.

## Overview

The Flag Health Check tool helps you identify potential mismatches between your code's fallback values and LaunchDarkly's environment default rules. These mismatches can lead to unexpected behavior during LaunchDarkly outages or connectivity issues, potentially impacting customer experience.

## Features

- 🔍 **Flag Status Monitoring** - View flag statuses (launched, active, inactive)
- ⚠️ **Mismatch Detection** - Identify discrepancies between fallback values and environment defaults
- 🎯 **BCP Health Checks** - Ensure business continuity planning with consistent configurations
- 🔗 **Direct LaunchDarkly Integration** - Connects directly to LaunchDarkly API
- 📊 **Visual Results** - Interactive dashboard with filtering and detailed flag information
- 🔔 **Active Flag Alerts** - Highlights flags that need review

## Quick Start

### Prerequisites

- A LaunchDarkly account
- A LaunchDarkly API key (READ ONLY recommended)
- A modern web browser

### Usage

1. **Open the Tool**
   
   Open `index.html` in your web browser, or host it on a web server.

2. **Enter Configuration**
   
   - **API Key**: Enter your LaunchDarkly API key (read-only access is recommended for security)
   - **Project Key**: Select or search for your project (populated automatically after entering API key)
   - **Environment**: Select the environment to check (e.g., production, staging)

3. **Run Health Check**
   
   Click "Run Health Check" to analyze your flags.

4. **Review Results**
   
   - View summary statistics (launched, active, inactive flags, and mismatches)
   - Click on summary boxes to filter results
   - Click on flag cards to expand/collapse details
   - Check for mismatches between fallback values and environment defaults

## What Does It Check?

The tool compares two critical values for each feature flag:

1. **Fallback Value** - The value your application uses when LaunchDarkly is unavailable
2. **Environment Default Value** - The value configured in LaunchDarkly's default rule

### Why This Matters

If these values don't match, your application might behave differently during a LaunchDarkly outage than it does during normal operations. This can lead to:

- Unexpected feature behavior
- Degraded customer experience
- Difficult-to-debug issues

### Best Practice

Keep your fallback values synchronized with your LaunchDarkly environment defaults to ensure consistent behavior during outages.

## Understanding Results

- 🟢 **Launched** - Permanent flags that are fully rolled out
- 🟡 **Active** - Temporary flags currently in use (need review)
- 🔴 **Inactive** - Flags that haven't been evaluated recently
- ✓ **Match** - Fallback value matches environment default (good!)
- ⚠️ **Mismatch** - Values don't match (needs attention)
- ❓ **Unable to Determine** - Dynamic targeting (percentage rollouts, experiments) prevents comparison

## Limitations

- Cannot compare flags with dynamic targeting strategies (percentage rollouts, experiments, guarded rollouts)
- Requires browser access to LaunchDarkly API (CORS enabled)
- Only compares static fallback values with static default rules

## Installation

### Option 1: Direct Use

Simply open `index.html` in your browser.

### Option 2: Local Web Server

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (with http-server)
npx http-server -p 8000

# Then open http://localhost:8000
```

### Option 3: Deploy to Static Hosting

Deploy to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- AWS S3
- Any web server

## Security Notes

- **API Key Security**: Use read-only API keys when possible
- **Browser-Based**: All API calls are made directly from your browser
- **No Backend**: No data is stored or transmitted to any third-party servers
- **Local Storage**: API keys are not persisted (you must re-enter them each session)

## Contributing

This is a LaunchDarkly Labs project. Contributions are welcome! Please feel free to submit issues or pull requests.

## LaunchDarkly Labs Disclaimer

This repository is maintained by LaunchDarkly Labs. While we try to keep it up to date, it is not officially supported by LaunchDarkly. For officially supported SDKs and tools, visit https://launchdarkly.com

## License

Apache 2.0 - see [LICENSE](LICENSE) file for details.

## Resources

- [LaunchDarkly Documentation](https://docs.launchdarkly.com/)
- [Feature Flag Best Practices](https://launchdarkly.com/blog/feature-flag-best-practices/)
- [LaunchDarkly API Reference](https://apidocs.launchdarkly.com/)

---

Made with ❤️ by LaunchDarkly Labs

