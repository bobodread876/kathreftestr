import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }
    
    // Extract video ID from URL
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^#&?]*)/);
    if (!videoIdMatch) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }
    
    const videoId = videoIdMatch[1];
    
    // Use YouTube oEmbed API (no authentication required)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch YouTube metadata');
    }
    
    const data = await response.json();
    
    // Extract metadata
    const metadata = {
      title: data.title || '',
      channelName: data.author_name || '',
      channelUrl: data.author_url || '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      thumbnailFallback: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      videoId: videoId
    };
    
    return NextResponse.json(metadata);
    
  } catch (error: any) {
    console.error('Error fetching YouTube metadata:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metadata', details: error.message },
      { status: 500 }
    );
  }
}