const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const path = require('path');

const WS_PORT = 8082;
const activeStreams = new Map();

const wss = new WebSocketServer({ port: WS_PORT });

console.log(`WebSocket server listening on port ${WS_PORT}`);

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  let ffmpegProcess = null;
  let streamId = null;
  let metadataReceived = false;
  
  // Send test message
  ws.send(JSON.stringify({ type: 'test', message: 'Connected to WebSocket server' }));
  
  ws.on('message', (message) => {
    try {
      if (!metadataReceived) {
        const data = JSON.parse(message.toString());
        console.log('Received metadata:', data);
        
        if (data.streamId) {
          streamId = data.streamId;
          metadataReceived = true;
          const rtmpUrl = `rtmp://localhost:1935/live/${streamId}`;
          
          console.log(`Starting ffmpeg for stream ${streamId}`);
          
          // Automatically publish to Nostr
          const hlsUrl = `http://localhost:8890/live/${streamId}/index.m3u8`;
          const publishArgs = [
            path.join(__dirname, 'publish-server.js'),
            hlsUrl
          ];
          
          // Add title if provided
          if (data.title) {
            publishArgs.push('--title', data.title);
          }
          
          // Add nsec if provided
          if (data.nsec) {
            publishArgs.push('--nsec', data.nsec);
          }
          
          // Add thumbnail if provided
          if (data.thumbnail) {
            publishArgs.push('--thumbnail', data.thumbnail);
          }
          
          // Add channel name if provided
          if (data.channelName) {
            publishArgs.push('--channelName', data.channelName);
          }
          
          console.log('Auto-publishing to Nostr with args:', publishArgs);
          
          // Capture output to extract nsec and npub
          let publishOutput = '';
          const publishProcess = spawn('node', publishArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          publishProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(output);
            publishOutput += output;
            
            // Extract npub, nsec, and naddr from output
            const npubMatch = output.match(/Generated npub: (npub\w+)/);
            const nsecMatch = output.match(/Save this nsec to republish updates: (nsec\w+)/);
            const naddrMatch = output.match(/Generated naddr: (naddr\w+)/);
            
            if (npubMatch || nsecMatch || naddrMatch) {
              const nostrInfo = {
                type: 'nostr-info',
                npub: npubMatch ? npubMatch[1] : null,
                nsec: nsecMatch ? nsecMatch[1] : null,
                naddr: naddrMatch ? naddrMatch[1] : null
              };
              
              // Send back to browser
              console.log('Sending Nostr info back to browser');
              ws.send(JSON.stringify(nostrInfo));
            }
          });
          
          publishProcess.stderr.on('data', (data) => {
            console.error('Publish error:', data.toString());
          });
          
          publishProcess.on('exit', (code) => {
            if (code === 0) {
              console.log('Successfully published to Nostr');
            } else {
              console.error('Failed to publish to Nostr, exit code:', code);
            }
          });
          
          // Start ffmpeg
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
            console.log(`[ffmpeg ${streamId}]:`, data.toString());
          });
          
          ffmpegProcess.on('exit', (code) => {
            console.log(`[ffmpeg ${streamId}] exited with code ${code}`);
            activeStreams.delete(streamId);
          });
          
          // Send ready signal
          ws.send(JSON.stringify({ status: 'ready', streamId }));
          console.log('Sent ready signal');
        }
      } else if (ffmpegProcess && ffmpegProcess.stdin) {
        // Forward video data to ffmpeg
        ffmpegProcess.stdin.write(Buffer.from(message));
      }
    } catch (error) {
      console.error('Message processing error:', error);
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
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server...');
  activeStreams.forEach((proc) => proc.kill());
  process.exit(0);
});