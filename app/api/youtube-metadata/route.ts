import { NextRequest, NextResponse } from 'next/server';

// Extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^#&?]*)/,
    /^([^#&?]*)$/  // Direct video ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Method 1: Try oEmbed API (simple, no auth needed)
async function fetchOEmbedMetadata(videoId: string) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NostrStreamBot/1.0)'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || '',
        channelName: data.author_name || '',
        channelUrl: data.author_url || ''
      };
    }
  } catch (error) {
    console.log('oEmbed method failed:', error);
  }
  return null;
}

// Method 2: Try noembed.com (third-party service)
async function fetchNoembedMetadata(videoId: string) {
  try {
    const noembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(noembedUrl);
    
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || '',
        channelName: data.author_name || '',
        channelUrl: data.author_url || ''
      };
    }
  } catch (error) {
    console.log('Noembed method failed:', error);
  }
  return null;
}

// Method 3: Parse directly from YouTube page (most reliable but slower)
async function fetchPageMetadata(videoId: string) {
  try {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      
      // Extract title from meta tags or JSON-LD
      let title = '';
      const titleMatch = html.match(/<meta\s+name="title"\s+content="([^"]+)"/);
      if (titleMatch) {
        title = titleMatch[1];
      } else {
        const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
        if (ogTitleMatch) {
          title = ogTitleMatch[1];
        }
      }
      
      // Extract channel name
      let channelName = '';
      const channelMatch = html.match(/"author":"([^"]+)"/);
      if (channelMatch) {
        channelName = channelMatch[1];
      } else {
        const linkMatch = html.match(/<link\s+itemprop="name"\s+content="([^"]+)"/);
        if (linkMatch) {
          channelName = linkMatch[1];
        }
      }
      
      // Try to extract from JSON-LD
      const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json">([^<]+)<\/script>/);
      if (jsonLdMatch) {
        try {
          const jsonData = JSON.parse(jsonLdMatch[1]);
          if (jsonData['@type'] === 'VideoObject') {
            title = title || jsonData.name || '';
            channelName = channelName || (jsonData.author && jsonData.author.name) || '';
          }
        } catch (e) {
          // JSON parsing failed, continue with what we have
        }
      }
      
      if (title || channelName) {
        return {
          title: title,
          channelName: channelName,
          channelUrl: channelName ? `https://www.youtube.com/@${channelName.replace(/\s+/g, '')}` : ''
        };
      }
    }
  } catch (error) {
    console.log('Page parsing method failed:', error);
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }
    
    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }
    
    // Try multiple methods to get metadata
    let metadata = null;
    
    // Try oEmbed first (fastest)
    metadata = await fetchOEmbedMetadata(videoId);
    
    // If oEmbed fails, try noembed
    if (!metadata || !metadata.title) {
      metadata = await fetchNoembedMetadata(videoId);
    }
    
    // If both fail, try parsing the page directly
    if (!metadata || !metadata.title) {
      metadata = await fetchPageMetadata(videoId);
    }
    
    // Build response with fallbacks
    const responseData = {
      title: metadata?.title || '',
      channelName: metadata?.channelName || '',
      channelUrl: metadata?.channelUrl || '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      thumbnailFallback: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      videoId: videoId
    };
    
    // Even if we couldn't get title/channel, we can still return thumbnails
    return NextResponse.json(responseData);
    
  } catch (error: any) {
    console.error('Error in YouTube metadata API:', error);
    
    // Try to extract video ID for thumbnails at least
    try {
      const { url } = await request.json();
      const videoId = extractVideoId(url);
      if (videoId) {
        return NextResponse.json({
          title: '',
          channelName: '',
          channelUrl: '',
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          thumbnailFallback: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          videoId: videoId
        });
      }
    } catch (e) {
      // Even this failed
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch metadata', details: error.message },
      { status: 500 }
    );
  }
}