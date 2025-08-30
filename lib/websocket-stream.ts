import { spawn, ChildProcess } from "child_process";
import { WebSocket, WebSocketServer } from "ws";

const activeStreams = new Map<string, ChildProcess>();

export function startWebSocketServer(port: number = 8081) {
  const wss = new WebSocketServer({ port });
  
  console.log(`WebSocket server listening on port ${port}`);
  
  wss.on("connection", (ws: WebSocket) => {
    let ffmpegProcess: ChildProcess | null = null;
    let streamId: string | null = null;
    
    ws.on("message", (message) => {
      try {
        // First message should be metadata
        if (!ffmpegProcess && message.toString().startsWith("{")) {
          const metadata = JSON.parse(message.toString());
          streamId = metadata.streamId;
          const rtmpUrl = `rtmp://localhost:1935/live/${streamId}`;
          
          console.log(`Starting ffmpeg for stream ${streamId} -> ${rtmpUrl}`);
          
          // Start ffmpeg process to receive WebM and output to RTMP
          ffmpegProcess = spawn("ffmpeg", [
            "-f", "webm",
            "-i", "pipe:0",
            "-c:v", "libx264",
            "-preset", "veryfast", 
            "-tune", "zerolatency",
            "-c:a", "aac",
            "-ar", "44100",
            "-b:a", "128k",
            "-f", "flv",
            rtmpUrl
          ], {
            stdio: ["pipe", "pipe", "pipe"]
          });
          
          if (streamId) {
            activeStreams.set(streamId, ffmpegProcess);
          }
          
          ffmpegProcess.stderr?.on("data", (data) => {
            console.log(`[Stream ${streamId}] ffmpeg:`, data.toString());
          });
          
          ffmpegProcess.on("exit", (code) => {
            console.log(`[Stream ${streamId}] ffmpeg exited with code ${code}`);
            if (streamId) {
              activeStreams.delete(streamId);
            }
          });
          
          ws.send(JSON.stringify({ status: "ready", streamId }));
        }
        // Subsequent messages are video data
        else if (ffmpegProcess && ffmpegProcess.stdin && Buffer.isBuffer(message)) {
          ffmpegProcess.stdin.write(message);
        }
      } catch (error) {
        console.error("WebSocket error:", error);
      }
    });
    
    ws.on("close", () => {
      console.log(`WebSocket closed for stream ${streamId}`);
      if (ffmpegProcess) {
        ffmpegProcess.stdin?.end();
        ffmpegProcess.kill();
        if (streamId) {
          activeStreams.delete(streamId);
        }
      }
    });
  });
  
  return wss;
}

export function stopStream(streamId: string) {
  const proc = activeStreams.get(streamId);
  if (proc) {
    proc.kill();
    activeStreams.delete(streamId);
  }
}