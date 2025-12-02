import { NextRequest, NextResponse } from 'next/server';

const LD_API_BASE = 'https://app.launchdarkly.com/api/v2';

async function fetchFlagDetail(apiKey: string, flagStatus: any) {
  try {
    const flagUrl = flagStatus._links?.parent?.href;
    
    if (!flagUrl) {
      return { error: 'No detail URL found', flagStatus };
    }
    
    const fullUrl = `https://app.launchdarkly.com${flagUrl}`;
    
    const response = await fetch(fullUrl, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return { error: 'Failed to fetch detail', flagStatus };
    }
    
    const detail = await response.json();
    return { detail, flagStatus };
  } catch (error: any) {
    console.error('Error fetching flag detail:', error);
    return { error: error.message, flagStatus };
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
    
    // Batched flag detail fetching
    const batchSize = 15; // Process 15 flags at a time
    const results = [];
    
    for (let i = 0; i < flags.length; i += batchSize) {
      const batch = flags.slice(i, i + batchSize);
      const batchPromises = batch.map((flag: any) => fetchFlagDetail(apiKey, flag));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to be nice to API (except for last batch)
      if (i + batchSize < flags.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return NextResponse.json({ flagDetails: results });
  } catch (error: any) {
    console.error('Error fetching flag details:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch flag details' },
      { status: 500 }
    );
  }
}

