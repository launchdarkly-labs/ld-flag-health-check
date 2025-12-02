# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-12-02

### Added

- **Rate Limit Tracking & Management**
  - Real-time rate limit monitoring from LaunchDarkly API response headers
  - Visual rate limit status bar with color-coded indicators (green/yellow/red)
  - Displays remaining API calls, reset countdown, and detailed breakdown
  - Automatic throttling when approaching rate limits (< 10 requests remaining)
  - Intelligent waiting for rate limit reset windows (10-second LaunchDarkly cycles)
  
- **Enhanced Request Handling**
  - New `fetchWithRateLimit()` wrapper for all API calls
  - Automatic retry logic with exponential backoff for 429 (Too Many Requests) errors
  - Network error recovery with up to 3 retry attempts
  - Comprehensive header extraction and logging for debugging
  
- **Batched Request Processing**
  - Batch processing for flag detail requests (15 flags at a time)
  - Prevents overwhelming the API with hundreds of simultaneous requests
  - Progress indicator showing "Fetching flag details: X/Y..."
  - Configurable delays between batches (100ms default)
  - Significantly improved reliability for large flag sets (100+ flags)
  
- **Improved User Experience**
  - Live progress updates during flag fetching
  - Dynamic status messages showing operation progress
  - Visual feedback on API usage and limits
  - Pulsing animation for critical rate limit warnings

### Changed

- All API calls now use enhanced `fetchWithRateLimit()` wrapper
- Flag detail fetching changed from parallel (all at once) to batched processing
- Loading messages now show dynamic progress and flag counts

### Technical Details

- Tracks LaunchDarkly-specific headers: `X-Ratelimit-Global-Remaining`, `X-Ratelimit-Route-Remaining`, `X-Ratelimit-Reset`
- Respects LaunchDarkly's 10-second rate limit reset windows
- Console logging for all rate limit events and retries
- Fully backward compatible with existing functionality

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

