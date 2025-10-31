# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-31

### Added

- Initial release of LaunchDarkly Flag Health Check tool
- Browser-based flag health checking with direct LaunchDarkly API integration
- API key validation and project/environment selection with searchable dropdowns
- Flag status monitoring (launched, active, inactive)
- Mismatch detection between fallback values and environment default rules
- BCP (Business Continuity Planning) health checks
- Interactive results dashboard with filtering capabilities
- Detailed flag information with expand/collapse functionality
- Visual indicators for flag health (match, mismatch, unknown)
- Informational tooltips explaining flag statuses and recommendations
- Direct links to flags in LaunchDarkly UI
- Support for pagination when fetching large numbers of projects
- Support for multiple flag types and variation values
- Responsive design using LaunchDarkly design tokens
- Zero backend requirements - fully client-side implementation

### Features

- **Configuration**
  - API key format validation
  - Automatic project and environment population
  - Searchable project and environment selection

- **Health Checking**
  - Comprehensive flag status analysis
  - Fallback value vs. environment default comparison
  - Support for boolean, string, number, and JSON flag values
  - Handling of dynamic targeting strategies (percentage rollouts, experiments)

- **Results Display**
  - Summary statistics with counts by status
  - Clickable filters for launched, active, inactive, and mismatched flags
  - Collapsible flag cards for detailed information
  - Color-coded status badges
  - Mismatch warnings with actionable recommendations

- **User Experience**
  - Modern, clean UI using LaunchDarkly design system
  - Loading states and error handling
  - Helpful tooltips with best practices
  - Direct navigation to flags in LaunchDarkly

[1.0.0]: https://github.com/launchdarkly-labs/ld-flag-health-check/releases/tag/v1.0.0

