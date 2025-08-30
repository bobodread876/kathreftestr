import { spawn, ChildProcess } from "node:child_process";
import crypto from "node:crypto";

export interface MirrorHandle {
  proc: ChildProcess;
  id: string;
  hlsUrl: string;
  sourceUrl: string;
  startTime: Date;
}

// In-memory registry for development
const RUNNING = new Map<string, MirrorHandle>();

export interface MirrorOptions {
  sourceUrl: string;
  streamId?: string;
  quality?: string;
}

export interface MirrorResult {
  id: string;
  hlsUrl: string;
  rtmpUrl: string;
}

/**
 * Starts a mirror pipeline:
 *   streamlink/yt-dlp -> ffmpeg -> RTMP ingest (MediaMTX)
 * Returns stream id + HLS URL.
 */
export function startMirror(options: MirrorOptions): MirrorResult {
  const id = options.streamId || crypto.randomUUID().slice(0, 8);
  const rtmpBase = process.env.RTMP_URL || "rtmp://localhost:1935/live";
  
  // In production, use the public URL for HLS
  const defaultHlsBase = process.env.NODE_ENV === 'production' 
    ? "https://kathreftestr.onrender.com/live"
    : "http://localhost:8890/live";
  const hlsBase = process.env.HLS_BASE || defaultHlsBase;
  const quality = options.quality || "best";
  
  const rtmpUrl = `${rtmpBase}/${id}`;
  const hlsUrl = `${hlsBase}/${id}/index.m3u8`;

  // Try yt-dlp first as it's more reliable for YouTube
  // Use streamlink as fallback for Twitch
  const isYouTube = options.sourceUrl.includes('youtube.com') || options.sourceUrl.includes('youtu.be');
  
  let command: string;
  if (isYouTube) {
    // For YouTube, use multiple extraction methods with better bot evasion
    command = `
      while true; do
        echo "[Stream ${id}] Attempting to connect to YouTube stream..."
        
        # Method 1: Try yt-dlp with cookies and user agent
        echo "[Stream ${id}] Method 1: Trying yt-dlp with enhanced options..."
        STREAM_URL=$(yt-dlp \
          --format "best[height<=1080][ext=mp4]/best[height<=1080]/best" \
          --get-url \
          --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
          --extractor-args "youtube:player_client=ios,android,web,tv_embedded" \
          --no-check-certificate \
          --quiet --no-warnings \
          "${options.sourceUrl}" 2>&1 | grep -E '^https' | head -1)
        
        if [ -n "$STREAM_URL" ]; then
          echo "[Stream ${id}] Got stream URL via yt-dlp, starting stream..."
          ffmpeg -user_agent "Mozilla/5.0" -re -i "$STREAM_URL" \
            -c:v libx264 -preset veryfast -tune zerolatency -b:v 2000k -maxrate 2500k -bufsize 5000k \
            -c:a aac -ar 44100 -b:a 128k \
            -f flv -flvflags no_duration_filesize ${rtmpUrl} 2>&1
          
          echo "[Stream ${id}] Stream ended"
        else
          # Method 2: Try direct yt-dlp pipe with different client
          echo "[Stream ${id}] Method 2: Trying direct yt-dlp pipe..."
          yt-dlp \
            --format "best[height<=720]/best" \
            --quiet --no-warnings -o - \
            --user-agent "Mozilla/5.0" \
            --extractor-args "youtube:player_client=tv_embedded" \
            "${options.sourceUrl}" 2>/dev/null | \
            ffmpeg -re -i pipe:0 \
              -c:v libx264 -preset veryfast -tune zerolatency -b:v 2000k \
              -c:a aac -ar 44100 -b:a 128k \
              -f flv ${rtmpUrl} 2>&1
          
          if [ \${PIPESTATUS[0]} -ne 0 ]; then
            # Method 3: Fallback to streamlink
            echo "[Stream ${id}] Method 3: Trying streamlink..."
            streamlink \
              --player-external-http \
              --player-external-http-port 0 \
              --default-stream "720p,best" \
              --retry-streams 3 \
              --retry-max 3 \
              "${options.sourceUrl}" best -O 2>/dev/null | \
              ffmpeg -re -i pipe:0 \
                -c:v libx264 -preset veryfast -tune zerolatency -b:v 2000k \
                -c:a aac -ar 44100 -b:a 128k \
                -f flv ${rtmpUrl} 2>&1
          fi
        fi
        
        echo "[Stream ${id}] Waiting 15 seconds before retry..."
        sleep 15
      done
    `.trim();
  } else {
    // Use streamlink for Twitch with better error visibility
    command = `
      while true; do
        echo "[Stream ${id}] Connecting to Twitch stream..."
        streamlink --stdout "${options.sourceUrl}" ${quality} \
          --retry-streams 30 --retry-max 10 2>&1 | \
          ffmpeg -re -i pipe:0 \
            -c:v libx264 -preset ultrafast -tune zerolatency \
            -c:a aac -b:a 128k \
            -f flv ${rtmpUrl} 2>&1
        echo "[Stream ${id}] Stream ended, retrying in 10 seconds..."
        sleep 10
      done
    `.trim();
  }
  
  console.log(`[Stream ${id}] Executing command:`, command);
  
  // Use exec for piped commands instead of spawn
  const proc = spawn('bash', ['-c', command], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    shell: false,  // Don't use shell since we're already using bash -c
  });

  // Log output for debugging
  proc.stdout?.on("data", (data) => {
    const output = data.toString().trim();
    if (output) console.log(`[Stream ${id}] stdout:`, output);
  });

  proc.stderr?.on("data", (data) => {
    const output = data.toString().trim();
    if (output && !output.includes('frame=')) {  // Filter out ffmpeg progress
      console.error(`[Stream ${id}] stderr:`, output);
    }
  });

  // Clean up on exit
  proc.on("exit", (code) => {
    console.log(`[Stream ${id}] Process exited with code ${code}`);
    RUNNING.delete(id);
  });

  proc.on("error", (error) => {
    console.error(`[Stream ${id}] Process error:`, error);
    RUNNING.delete(id);
  });

  const handle: MirrorHandle = {
    proc,
    id,
    hlsUrl,
    sourceUrl: options.sourceUrl,
    startTime: new Date(),
  };

  RUNNING.set(id, handle);

  return { id, hlsUrl, rtmpUrl };
}

export function stopMirror(id: string): boolean {
  const handle = RUNNING.get(id);
  if (!handle) return false;
  
  try {
    handle.proc.kill("SIGTERM");
    RUNNING.delete(id);
    return true;
  } catch (error) {
    console.error(`Failed to stop stream ${id}:`, error);
    return false;
  }
}

export function getMirrorStatus(id: string): MirrorHandle | undefined {
  return RUNNING.get(id);
}

export function getAllMirrors(): MirrorHandle[] {
  return Array.from(RUNNING.values());
}

export function stopAllMirrors(): void {
  RUNNING.forEach((handle, id) => {
    try {
      handle.proc.kill("SIGTERM");
    } catch (error) {
      console.error(`Failed to stop stream ${id}:`, error);
    }
  });
  RUNNING.clear();
}

// Clean up on process exit
process.on("SIGINT", () => {
  console.log("\nShutting down all streams...");
  stopAllMirrors();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAllMirrors();
  process.exit(0);
});