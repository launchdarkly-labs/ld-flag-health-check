import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/app/utils/rateLimiter';
import { fetchWithRetry, getErrorMessage } from '@/app/utils/retry';

const LD_API_BASE = 'https://app.launchdarkly.com/api/v2';

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('authorization');
  const searchParams = request.nextUrl.searchParams;
  const projectKey = searchParams.get('projectKey');
  const environment = searchParams.get('environment');
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key is required' },
      { status: 401 }
    );
  }

  if (!projectKey || !environment) {
    return NextResponse.json(
      { error: 'Project key and environment are required' },
      { status: 400 }
    );
  }

  try {
    // Wait if rate limit is low
    await rateLimiter.waitIfNeeded();
    
    const url = `${LD_API_BASE}/flag-statuses/${projectKey}/${environment}`;
    
    const response = await fetchWithRetry(url, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    }, {
      maxRetries: 3,
      initialDelay: 1000,
      retryableStatuses: [429, 500, 502, 503, 504]
    });
    
    // Update rate limit info from headers
    rateLimiter.updateFromHeaders(response.headers);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(getErrorMessage({ response }, 'fetching flag statuses'));
      (error as any).response = response;
      throw error;
    }
    
    const data = await response.json();
    const flags = data.items || [];
    const rateLimitInfo = rateLimiter.getRateLimitInfo();
    
    return NextResponse.json({ 
      flags,
      rateLimitInfo 
    });
  } catch (error: any) {
    console.error('Error fetching flag statuses:', error);
    const errorMessage = getErrorMessage(error, 'fetching flag statuses');
    const status = error.response?.status || (error.response instanceof Response ? error.response.status : 500);
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}

