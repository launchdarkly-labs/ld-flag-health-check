// Helper to get rate limit status from rate limit info

export interface RateLimitInfo {
  globalRemaining: number | null;
  routeRemaining: number | null;
  resetTime: number | null;
  retryAfter: number | null;
}

export function getRateLimitStatus(info: RateLimitInfo): { level: 'good' | 'warning' | 'danger'; message: string } {
  if (info.globalRemaining === null && info.routeRemaining === null) {
    return {
      level: 'good',
      message: 'Rate limit information not available'
    };
  }
  
  const lowest = Math.min(
    info.globalRemaining !== null ? info.globalRemaining : Infinity,
    info.routeRemaining !== null ? info.routeRemaining : Infinity
  );
  
  if (!isFinite(lowest)) {
    return {
      level: 'good',
      message: 'Rate limit information not available'
    };
  }
  
  const secondsUntilReset = info.resetTime 
    ? Math.max(0, Math.floor((info.resetTime - Date.now()) / 1000))
    : 0;
  
  if (lowest < 20) {
    return {
      level: 'danger',
      message: `🚨 Critical: ${lowest} requests remaining. Resets in ${secondsUntilReset}s`
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

