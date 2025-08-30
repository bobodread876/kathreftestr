const { spawn } = require('child_process');
const { existsSync } = require('fs');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

let mediamtxProcess = null;
const activeStreams = new Map();

// WebSocket handler for browser streaming
function handleWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection established from', req.url);
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
}

// Start MediaMTX if in production
async function startMediaMTX() {
  if (process.env.NODE_ENV === 'production') {
    const mediamtxPath = '/usr/local/bin/mediamtx';
    const configPath = '/etc/mediamtx.yml';
  
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
      
      // Wait for MediaMTX to start
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log('MediaMTX not found in production');
    }
  }
}

// Main server setup
app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });
  
  // Create WebSocket server attached to the same HTTP server
  const wss = new WebSocketServer({ 
    server,
    path: '/api/ws'
  });
  
  handleWebSocket(wss);
  
  const PORT = process.env.PORT || 3000;
  
  server.listen(PORT, async (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    
    // Start MediaMTX after server is up
    await startMediaMTX();
  });
});

function cleanup() {
  if (mediamtxProcess) {
    console.log('Stopping MediaMTX...');
    mediamtxProcess.kill();
  }
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);