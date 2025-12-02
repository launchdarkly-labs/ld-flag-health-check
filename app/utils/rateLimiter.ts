// Rate limiting utility for LaunchDarkly API calls

export interface RateLimitInfo {
  globalRemaining: number | null;
  routeRemaining: number | null;
  resetTime: number | null;
  retryAfter: number | null;
}

export class RateLimiter {
  private rateLimitInfo: RateLimitInfo = {
    globalRemaining: null,
    routeRemaining: null,
    resetTime: null,
    retryAfter: null
  };

  // Update rate limit info from response headers
  updateFromHeaders(headers: Headers): void {
    // Try multiple header name variations (case-insensitive)
    const globalRemaining = this.getHeader(headers, [
      'X-Ratelimit-Global-Remaining',
      'x-ratelimit-global-remaining',
      'X-RateLimit-Global-Remaining',
      'RateLimit-Global-Remaining'
    ]);
    
    const routeRemaining = this.getHeader(headers, [
      'X-Ratelimit-Route-Remaining',
      'x-ratelimit-route-remaining',
      'X-RateLimit-Route-Remaining',
      'RateLimit-Route-Remaining'
    ]);
    
    const resetTime = this.getHeader(headers, [
      'X-Ratelimit-Reset',
      'x-ratelimit-reset',
      'X-RateLimit-Reset',
      'RateLimit-Reset'
    ]);
    
    const retryAfter = this.getHeader(headers, [
      'Retry-After',
      'retry-after'
    ]);
    
    this.rateLimitInfo = {
      globalRemaining: globalRemaining ? parseInt(globalRemaining) : null,
      routeRemaining: routeRemaining ? parseInt(routeRemaining) : null,
      resetTime: resetTime ? parseInt(resetTime) : null,
      retryAfter: retryAfter ? parseInt(retryAfter) : null
    };
  }

  private getHeader(headers: Headers, names: string[]): string | null {
    for (const name of names) {
      const value = headers.get(name);
      if (value) return value;
    }
    return null;
  }

  // Get current rate limit info
  getRateLimitInfo(): RateLimitInfo {
    return { ...this.rateLimitInfo };
  }

  // Check if we should throttle requests
  shouldThrottle(threshold: number = 10): boolean {
    const { globalRemaining, routeRemaining } = this.rateLimitInfo;
    
    if (globalRemaining === null && routeRemaining === null) {
      return false;
    }
    
    const lowest = Math.min(
      globalRemaining !== null ? globalRemaining : Infinity,
      routeRemaining !== null ? routeRemaining : Infinity
    );
    
    return isFinite(lowest) && lowest < threshold;
  }

  // Calculate wait time before next request
  async waitIfNeeded(): Promise<void> {
    if (this.shouldThrottle()) {
      const { resetTime, retryAfter } = this.rateLimitInfo;
      
      let waitTime = 0;
      
      if (retryAfter !== null) {
        waitTime = retryAfter * 1000; // Convert to milliseconds
      } else if (resetTime !== null) {
        waitTime = Math.max(0, resetTime - Date.now() + 100); // Add 100ms buffer
      }
      
      // Only wait up to 15 seconds
      if (waitTime > 0 && waitTime < 15000) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // Get status for display
  getStatus(): { level: 'good' | 'warning' | 'danger'; message: string } {
    const { globalRemaining, routeRemaining, resetTime } = this.rateLimitInfo;
    
    if (globalRemaining === null && routeRemaining === null) {
      return {
        level: 'good',
        message: 'Rate limit information not available'
      };
    }
    
    const lowest = Math.min(
      globalRemaining !== null ? globalRemaining : Infinity,
      routeRemaining !== null ? routeRemaining : Infinity
    );
    
    if (!isFinite(lowest)) {
      return {
        level: 'good',
        message: 'Rate limit information not available'
      };
    }
    
    const secondsUntilReset = resetTime 
      ? Math.max(0, Math.floor((resetTime - Date.now()) / 1000))
      : 0;
    
    if (lowest < 20) {
      return {
        level: 'danger',
        message: `⚠️ Critical: ${lowest} requests remaining. Resets in ${secondsUntilReset}s`
      };
    } else if (lowest < 50) {
      return {
        level: 'warning',
        message: `⚠️ Warning: ${lowest} requests remaining. Resets in ${secondsUntilReset}s`
      };
    } else {
      return {
        level: 'good',
        message: `✅ ${lowest} requests remaining. Resets in ${secondsUntilReset}s`
      };
    }
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

