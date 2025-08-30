const { spawn } = require('child_process');
const { existsSync } = require('fs');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');

let mediamtxProcess = null;
const activeStreams = new Map();

// Start WebSocket server for browser streaming
function startWebSocketServer(port = 8081) {
  const wss = new WebSocketServer({ port });
  
  console.log(`WebSocket server for browser streaming on port ${port}`);
  
  wss.on('connection', (ws) => {
    let ffmpegProcess = null;
    let streamId = null;
    
    ws.on('message', (message) => {
      try {
        // First message is metadata
        if (!ffmpegProcess && message.toString().startsWith('{')) {
          const metadata = JSON.parse(message.toString());
          streamId = metadata.streamId;
          const rtmpUrl = `rtmp://localhost:1935/live/${streamId}`;
          
          console.log(`Starting ffmpeg for browser stream ${streamId}`);
          
          // Start ffmpeg to transcode WebM to RTMP
          ffmpegProcess = spawn('ffmpeg', [
            '-f', 'webm',
            '-i', 'pipe:0',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-c:a', 'aac',
            '-ar', '44100',
            '-b:a', '128k',
            '-f', 'flv',
            rtmpUrl
          ], {
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          activeStreams.set(streamId, ffmpegProcess);
          
          ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('frame=')) {
              console.log(`[Browser ${streamId}]:`, output);
            }
          });
          
          ffmpegProcess.on('exit', (code) => {
            console.log(`[Browser ${streamId}] ffmpeg exited with code ${code}`);
            activeStreams.delete(streamId);
          });
          
          ws.send(JSON.stringify({ status: 'ready', streamId }));
        }
        // Subsequent messages are video chunks
        else if (ffmpegProcess && ffmpegProcess.stdin && Buffer.isBuffer(message)) {
          ffmpegProcess.stdin.write(message);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      console.log(`WebSocket closed for stream ${streamId}`);
      if (ffmpegProcess) {
        ffmpegProcess.stdin.end();
        ffmpegProcess.kill();
        activeStreams.delete(streamId);
      }
    });
  });
  
  return wss;
}

// Start MediaMTX first if in production
if (process.env.NODE_ENV === 'production') {
  const mediamtxPath = '/usr/local/bin/mediamtx';
  const configPath = '/etc/mediamtx.yml';
  
  // Start WebSocket server
  startWebSocketServer(8081);
  
  if (existsSync(mediamtxPath)) {
    console.log('Starting MediaMTX server...');
    
    mediamtxProcess = spawn(mediamtxPath, [configPath], {
      stdio: 'inherit',
      detached: false,
    });
    
    mediamtxProcess.on('error', (err) => {
      console.error('Failed to start MediaMTX:', err);
      console.log('Continuing with Next.js anyway...');
      mediamtxProcess = null;
    });
    
    mediamtxProcess.on('exit', (code) => {
      console.log(`MediaMTX exited with code ${code}`);
      if (code !== 0) {
        console.error('MediaMTX failed to start properly. This may be due to port conflicts.');
        console.log('Continuing with Next.js anyway...');
      }
      mediamtxProcess = null;
    });
    
    // Start Next.js after a short delay
    setTimeout(() => {
      console.log('Starting Next.js application...');
      startNextJs();
    }, 2000);
  } else {
    console.log('MediaMTX not found, starting Next.js directly...');
    startNextJs();
  }
} else {
  startNextJs();
}

function startNextJs() {
  // Start Next.js
  const next = spawn('npm', ['run', 'start:next'], {
    stdio: 'inherit',
    shell: true,
  });
  
  next.on('error', (err) => {
    console.error('Failed to start Next.js:', err);
    cleanup();
    process.exit(1);
  });
  
  next.on('exit', (code) => {
    cleanup();
    process.exit(code);
  });
}

function cleanup() {
  if (mediamtxProcess) {
    console.log('Stopping MediaMTX...');
    mediamtxProcess.kill();
  }
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);