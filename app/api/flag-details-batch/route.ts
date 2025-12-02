import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/app/utils/rateLimiter';
import { fetchWithRetry, getErrorMessage } from '@/app/utils/retry';

const LD_API_BASE = 'https://app.launchdarkly.com/api/v2';

async function fetchFlagDetail(apiKey: string, flagStatus: any): Promise<{ detail?: any; flagStatus: any; error?: string }> {
  try {
    const flagUrl = flagStatus._links?.parent?.href;
    
    if (!flagUrl) {
      return { error: 'No detail URL found', flagStatus };
    }
    
    // Wait if rate limit is low
    await rateLimiter.waitIfNeeded();
    
    const fullUrl = `https://app.launchdarkly.com${flagUrl}`;
    
    const response = await fetchWithRetry(fullUrl, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    }, {
      maxRetries: 2, // Fewer retries for individual flag details
      initialDelay: 500,
      retryableStatuses: [429, 500, 502, 503, 504]
    });
    
    // Update rate limit info from headers
    rateLimiter.updateFromHeaders(response.headers);
    
    if (!response.ok) {
      const errorMessage = getErrorMessage({ response }, `fetching flag ${flagStatus._links?.parent?.href?.split('/').pop() || 'detail'}`);
      return { error: errorMessage, flagStatus };
    }
    
    const detail = await response.json();
    return { detail, flagStatus };
  } catch (error: any) {
    console.error('Error fetching flag detail:', error);
    const errorMessage = getErrorMessage(error, `fetching flag ${flagStatus._links?.parent?.href?.split('/').pop() || 'detail'}`);
    return { error: errorMessage, flagStatus };
  }
}

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
    const { flags } = body;
    
    if (!flags || !Array.isArray(flags)) {
      return NextResponse.json(
        { error: 'Flags array is required' },
        { status: 400 }
      );
    }
    
    // Batched flag detail fetching with rate limiting and retry
    const batchSize = 15; // Process 15 flags at a time
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < flags.length; i += batchSize) {
      const batch = flags.slice(i, i + batchSize);
      const batchPromises = batch.map((flag: any) => fetchFlagDetail(apiKey, flag));
      const batchResults = await Promise.all(batchPromises);
      
      // Count successes and errors
      batchResults.forEach(result => {
        if (result.error) {
          errorCount++;
        } else {
          successCount++;
        }
      });
      
      results.push(...batchResults);
      
      // Small delay between batches to be nice to API (except for last batch)
      if (i + batchSize < flags.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const rateLimitInfo = rateLimiter.getRateLimitInfo();
    
    return NextResponse.json({ 
      flagDetails: results,
      rateLimitInfo,
      stats: {
        total: flags.length,
        successful: successCount,
        errors: errorCount
      }
    });
  } catch (error: any) {
    console.error('Error fetching flag details:', error);
    const errorMessage = getErrorMessage(error, 'fetching flag details');
    const status = error.response?.status || (error.response instanceof Response ? error.response.status : 500);
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}

