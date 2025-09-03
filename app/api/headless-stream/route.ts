import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

// Store active headless streams with ownership info
interface StreamInfo {
  process: any;
  npub: string;
  title?: string;
  startedAt: Date;
}

const activeStreams = new Map<string, StreamInfo>();

// Import auth utilities (will be transpiled)
async function verifyOwnership(nsec: string, npub: string): Promise<boolean> {
  try {
    const authUtils = require('../../../utils/nostr-auth');
    return authUtils.verifyNsecOwnership(nsec, npub);
  } catch (error) {
    console.error('Error verifying ownership:', error);
    return false;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { url, title, nsec, action } = await request.json();
    
    if (action === 'stop') {
      // Stop a stream with authentication
      const streamId = url; // In stop action, url contains streamId
      const streamInfo = activeStreams.get(streamId);
      
      if (!streamInfo) {
        return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
      }
      
      // Verify ownership with nsec
      if (!nsec) {
        return NextResponse.json({ error: 'Authentication required. Please provide your nsec.' }, { status: 401 });
      }
      
      const isOwner = await verifyOwnership(nsec, streamInfo.npub);
      if (!isOwner) {
        return NextResponse.json({ error: 'Authentication failed. This nsec does not match the stream owner.' }, { status: 403 });
      }
      
      // Stop the stream
      streamInfo.process.kill('SIGINT');
      activeStreams.delete(streamId);
      
      return NextResponse.json({ 
        success: true, 
        message: 'Stream stopped successfully',
        streamId 
      });
    }
    
    // Start a new stream
    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }
    
    const streamId = Math.random().toString(36).substring(2, 10);
    
    // Launch headless browser stream
    const scriptPath = path.join(process.cwd(), 'headless-stream-api.js');
    const args = [scriptPath, url, streamId];
    
    if (title) args.push('--title', title);
    if (nsec) args.push('--nsec', nsec);
    args.push('--publish'); // Always publish to Nostr
    
    console.log('Starting headless stream with args:', args);
    
    const headlessProcess = spawn('node', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });
    
    // Collect output for response
    let outputData = {
      streamId,
      hlsUrl: `http://localhost:8890/live/${streamId}/index.m3u8`,
      npub: '',
      nsec: '',
      naddr: '',
      title: '',
      channelName: '',
      thumbnail: ''
    };
    
    return new Promise<Response>((resolve) => {
      let dataCollected = false;
      const timeout = setTimeout(() => {
        if (!dataCollected) {
          // Store stream info even if we timeout
          if (outputData.npub) {
            activeStreams.set(streamId, {
              process: headlessProcess,
              npub: outputData.npub,
              title: outputData.title || title,
              startedAt: new Date()
            });
          }
          resolve(NextResponse.json(outputData));
        }
      }, 15000); // 15 second timeout
      
      headlessProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Headless output:', output);
        
        // Parse output for metadata
        const npubMatch = output.match(/Generated npub: (npub\w+)/);
        const nsecMatch = output.match(/Save this nsec to republish updates: (nsec\w+)/);
        const naddrMatch = output.match(/Generated naddr: (naddr\w+)/);
        const titleMatch = output.match(/Video Title: (.+)/);
        const channelMatch = output.match(/Channel: (.+)/);
        const thumbnailMatch = output.match(/Thumbnail: (.+)/);
        const streamStartedMatch = output.match(/Stream started:/);
        
        if (npubMatch) outputData.npub = npubMatch[1];
        if (nsecMatch && !nsec) outputData.nsec = nsecMatch[1];
        if (naddrMatch) outputData.naddr = naddrMatch[1];
        if (titleMatch) outputData.title = titleMatch[1];
        if (channelMatch) outputData.channelName = channelMatch[1];
        if (thumbnailMatch) outputData.thumbnail = thumbnailMatch[1];
        
        // Once we see stream started and have npub, store stream info and return
        if (streamStartedMatch && outputData.npub && !dataCollected) {
          dataCollected = true;
          clearTimeout(timeout);
          
          // Store stream info with ownership
          activeStreams.set(streamId, {
            process: headlessProcess,
            npub: outputData.npub,
            title: outputData.title || title,
            startedAt: new Date()
          });
          
          resolve(NextResponse.json({
            success: true,
            ...outputData
          }));
        }
      });
      
      headlessProcess.stderr.on('data', (data) => {
        console.error('Headless error:', data.toString());
      });
      
      headlessProcess.on('error', (error) => {
        console.error('Failed to start headless process:', error);
        activeStreams.delete(streamId);
        if (!dataCollected) {
          dataCollected = true;
          clearTimeout(timeout);
          resolve(NextResponse.json(
            { error: 'Failed to start headless stream', details: error.message },
            { status: 500 }
          ));
        }
      });
      
      headlessProcess.on('exit', (code) => {
        console.log(`Headless process exited with code ${code}`);
        activeStreams.delete(streamId);
        if (!dataCollected) {
          dataCollected = true;
          clearTimeout(timeout);
          if (code === 0) {
            resolve(NextResponse.json(outputData));
          } else {
            resolve(NextResponse.json(
              { error: 'Headless stream exited unexpectedly' },
              { status: 500 }
            ));
          }
        }
      });
    });
    
  } catch (error: any) {
    console.error('Error in headless stream API:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return list of active streams with public info only
  const streams = Array.from(activeStreams.entries()).map(([id, info]) => ({
    streamId: id,
    title: info.title,
    startedAt: info.startedAt,
    npub: info.npub // Public key is safe to share
  }));
  
  return NextResponse.json({ activeStreams: streams });
}