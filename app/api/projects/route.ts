import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/app/utils/rateLimiter';
import { fetchWithRetry, getErrorMessage } from '@/app/utils/retry';

const LD_API_BASE = 'https://app.launchdarkly.com/api/v2';

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('authorization');
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key is required' },
      { status: 401 }
    );
  }

  try {
    // Fetch all projects by handling pagination
    let allProjects: any[] = [];
    let offset = 0;
    const limit = 20;
    let hasMore = true;
    let totalCount = 0;

    while (hasMore) {
      // Wait if rate limit is low
      await rateLimiter.waitIfNeeded();
      
      const url = `${LD_API_BASE}/projects?limit=${limit}&offset=${offset}&expand=environments`;
      
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
        const error = new Error(getErrorMessage({ response }, 'fetching projects'));
        (error as any).response = response;
        throw error;
      }
      
      const data = await response.json();
      const projects = data.items || [];
      allProjects = allProjects.concat(projects);
      
      // Get total count from first response
      if (totalCount === 0) {
        totalCount = data.totalCount || 0;
      }
      
      offset += limit;
      hasMore = offset < totalCount;
    }
    
    const rateLimitInfo = rateLimiter.getRateLimitInfo();
    
    return NextResponse.json({ 
      projects: allProjects,
      rateLimitInfo,
      totalCount: totalCount || allProjects.length,
      loadedCount: allProjects.length
    });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    const errorMessage = getErrorMessage(error, 'fetching projects');
    const status = error.response?.status || 500;
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}

