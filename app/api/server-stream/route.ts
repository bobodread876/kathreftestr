import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Store active streams
const activeStreams = new Map<string, any>();

// Import the UnifiedStreamManager - use singleton
const UnifiedStreamManager = require('../../../unified-stream-manager');

// Create a singleton instance
let streamManager: any = null;
function getStreamManager() {
  if (!streamManager) {
    streamManager = new UnifiedStreamManager();
  }
  return streamManager;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, url, nsec, streamId } = body;

    // Get stream manager and initialize if needed
    const manager = getStreamManager();
    if (!manager.initialized) {
      await manager.initialize();
    }

    if (action === 'start') {
      if (!url) {
        return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
      }

      // Analyze the URL to determine best streaming method
      const analysis = await manager.analyzeUrl(url);
      
      // Start the stream with server method if supported
      if (analysis.serverSupported) {
        try {
          const result = await manager.startStream(url, {
            forceMethod: 'server',
            publishToNostr: body.publishToNostr,
            nsec: nsec,
            title: body.title,
            quality: body.quality || 'medium'
          });

          return NextResponse.json({
            success: true,
            ...result,
            analysis,
            message: 'Server streaming started successfully'
          });
        } catch (streamError: any) {
          console.error('Stream start error:', streamError);
          // Return partial success if stream started but Nostr publish failed
          if (streamError.message?.includes('Nostr')) {
            return NextResponse.json({
              success: true,
              streamId: manager.getActiveStreams()[0]?.streamId,
              hlsUrl: manager.getActiveStreams()[0]?.hlsUrl,
              analysis,
              warning: 'Stream started but Nostr publishing failed',
              message: 'Server streaming active (without Nostr)'
            });
          }
          throw streamError;
        }
      } else {
        // Fall back to headless browser if server streaming not supported
        return NextResponse.json({
          success: false,
          error: 'Server streaming not supported for this URL',
          analysis,
          fallback: 'browser',
          reasons: analysis.reasons
        }, { status: 400 });
      }
    } 
    else if (action === 'stop') {
      if (!streamId) {
        return NextResponse.json({ error: 'No streamId provided' }, { status: 400 });
      }

      try {
        const result = await manager.stopStream(streamId, nsec);
        return NextResponse.json(result);
      } catch (error: any) {
        if (error.message === 'Authentication failed') {
          return NextResponse.json({ error: 'Authentication failed' }, { status: 403 });
        }
        throw error;
      }
    }
    else if (action === 'status') {
      if (streamId) {
        const status = manager.getStreamStatus(streamId);
        if (!status) {
          return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
        }
        return NextResponse.json(status);
      } else {
        // Get all active streams
        const activeStreams = manager.getActiveStreams();
        return NextResponse.json({ activeStreams });
      }
    }
    else if (action === 'analyze') {
      if (!url) {
        return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
      }

      const analysis = await manager.analyzeUrl(url);
      return NextResponse.json(analysis);
    }
    else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Server stream error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process stream request', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get stream manager and initialize if needed
    const manager = getStreamManager();
    if (!manager.initialized) {
      await manager.initialize();
    }

    // Get capabilities and active streams
    const capabilities = manager.capabilities;
    const activeStreams = manager.getActiveStreams();

    return NextResponse.json({
      capabilities,
      activeStreams,
      ready: true
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: 'Failed to get stream status', 
        details: error.message 
      },
      { status: 500 }
    );
  }
}