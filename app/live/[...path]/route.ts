import { NextRequest, NextResponse } from 'next/server';

// Proxy HLS streams from MediaMTX
export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const mediamtxUrl = `http://localhost:8888/live/${path}`;
  
  try {
    const response = await fetch(mediamtxUrl, {
      headers: {
        'Range': req.headers.get('Range') || '',
      },
    });
    
    const headers = new Headers();
    
    // Copy relevant headers
    const contentType = response.headers.get('Content-Type');
    if (contentType) headers.set('Content-Type', contentType);
    
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) headers.set('Content-Length', contentLength);
    
    // CORS headers for HLS
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range');
    
    // Cache headers for segments
    if (path.endsWith('.ts')) {
      headers.set('Cache-Control', 'max-age=3600');
    } else if (path.endsWith('.m3u8')) {
      headers.set('Cache-Control', 'no-cache');
    }
    
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error('Error proxying HLS stream:', error);
    return new NextResponse('Stream not available', { status: 404 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
    },
  });
}