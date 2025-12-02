// Retry utility with exponential backoff

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504], // Rate limit and server errors
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
};

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const config = { ...DEFAULT_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // If successful, return immediately
      if (response.ok) {
        return response;
      }
      
      // Check if status is retryable
      if (config.retryableStatuses.includes(response.status)) {
        // If this is the last attempt, return the error response
        if (attempt === config.maxRetries) {
          return response;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        );
        
        // Check for Retry-After header
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : delay;
        
        console.log(`Retry attempt ${attempt + 1}/${config.maxRetries} after ${waitTime}ms for status ${response.status}`);
        
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, config.maxDelay)));
        continue;
      }
      
      // Non-retryable error, return immediately
      return response;
      
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = error.code && config.retryableErrors.includes(error.code);
      
      if (!isRetryable || attempt === config.maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelay
      );
      
      console.log(`Retry attempt ${attempt + 1}/${config.maxRetries} after ${delay}ms for error: ${error.message}`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Should never reach here, but TypeScript needs it
  if (lastError) {
    throw lastError;
  }
  
  throw new Error('Max retries exceeded');
}

// Enhanced error message generator
export function getErrorMessage(error: any, context: string): string {
  // Handle Response object
  if (error.response && error.response instanceof Response) {
    const status = error.response.status;
    const statusText = error.response.statusText;
    
    switch (status) {
      case 401:
        return `Authentication failed. Please check your API key. (${context})`;
      case 403:
        return `Access forbidden. Your API key may not have the required permissions. (${context})`;
      case 404:
        return `Resource not found. Please verify the project key and environment. (${context})`;
      case 429:
        return `Rate limit exceeded. Please wait a moment and try again. (${context})`;
      case 500:
        return `LaunchDarkly server error. Please try again later. (${context})`;
      case 502:
      case 503:
      case 504:
        return `LaunchDarkly service temporarily unavailable. Please try again in a moment. (${context})`;
      default:
        return `API error (${status} ${statusText}). ${context}`;
    }
  }
  
  // Handle error with response property (non-Response object)
  if (error.response && typeof error.response.status === 'number') {
    const status = error.response.status;
    const statusText = error.response.statusText || 'Unknown';
    
    switch (status) {
      case 401:
        return `Authentication failed. Please check your API key. (${context})`;
      case 403:
        return `Access forbidden. Your API key may not have the required permissions. (${context})`;
      case 404:
        return `Resource not found. Please verify the project key and environment. (${context})`;
      case 429:
        return `Rate limit exceeded. Please wait a moment and try again. (${context})`;
      case 500:
        return `LaunchDarkly server error. Please try again later. (${context})`;
      case 502:
      case 503:
      case 504:
        return `LaunchDarkly service temporarily unavailable. Please try again in a moment. (${context})`;
      default:
        return `API error (${status} ${statusText}). ${context}`;
    }
  }
  
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return `Connection error. Please check your internet connection and try again. (${context})`;
  }
  
  if (error.message) {
    return `${error.message} (${context})`;
  }
  
  return `An unexpected error occurred. ${context}`;
}

