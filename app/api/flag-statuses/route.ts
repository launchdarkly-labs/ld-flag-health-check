import { NextRequest, NextResponse } from 'next/server';

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
    const url = `${LD_API_BASE}/flag-statuses/${projectKey}/${environment}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to fetch flag statuses');
    }
    
    const data = await response.json();
    const flags = data.items || [];
    
    return NextResponse.json({ flags });
  } catch (error: any) {
    console.error('Error fetching flag statuses:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch flag statuses' },
      { status: 500 }
    );
  }
}

