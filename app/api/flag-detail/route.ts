import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/app/utils/rateLimiter';
import { fetchWithRetry, getErrorMessage } from '@/app/utils/retry';

const LD_API_BASE = 'https://app.launchdarkly.com/api/v2';

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('authorization');
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key is required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { flagUrl } = body;
    
    if (!flagUrl) {
      return NextResponse.json(
        { error: 'Flag URL is required' },
        { status: 400 }
      );
    }
    
    // Wait if rate limit is low
    await rateLimiter.waitIfNeeded();
    
    // flagUrl is already a full path like /api/v2/flags/project-key/flag-key
    // We need to prepend the base URL
    const fullUrl = `https://app.launchdarkly.com${flagUrl}`;
    
    const response = await fetchWithRetry(fullUrl, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    }, {
      maxRetries: 2,
      initialDelay: 500,
      retryableStatuses: [429, 500, 502, 503, 504]
    });
    
    // Update rate limit info from headers
    rateLimiter.updateFromHeaders(response.headers);
    
    if (!response.ok) {
      const errorMessage = getErrorMessage({ response }, 'fetching flag detail');
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }
    
    const detail = await response.json();
    const rateLimitInfo = rateLimiter.getRateLimitInfo();
    
    return NextResponse.json({ 
      detail,
      rateLimitInfo 
    });
  } catch (error: any) {
    console.error('Error fetching flag detail:', error);
    const errorMessage = getErrorMessage(error, 'fetching flag detail');
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

