import { NextRequest, NextResponse } from 'next/server';

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

    while (hasMore) {
      const url = `${LD_API_BASE}/projects?limit=${limit}&offset=${offset}&expand=environments`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      
      const data = await response.json();
      const projects = data.items || [];
      allProjects = allProjects.concat(projects);
      
      const totalCount = data.totalCount;
      offset += limit;
      hasMore = offset < totalCount;
    }
    
    return NextResponse.json({ projects: allProjects });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

