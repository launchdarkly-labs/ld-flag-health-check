import { NextRequest, NextResponse } from 'next/server';

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
    
    // flagUrl is already a full path like /api/v2/flags/project-key/flag-key
    // We need to prepend the base URL
    const fullUrl = `https://app.launchdarkly.com${flagUrl}`;
    
    const response = await fetch(fullUrl, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch flag detail' },
        { status: response.status }
      );
    }
    
    const detail = await response.json();
    return NextResponse.json({ detail });
  } catch (error: any) {
    console.error('Error fetching flag detail:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch flag detail' },
      { status: 500 }
    );
  }
}

