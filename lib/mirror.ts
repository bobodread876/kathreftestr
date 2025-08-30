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
    // For YouTube, try streamlink first as it often bypasses bot detection better
    // Use a wrapper script that will retry on failure
    command = `
      while true; do
        echo "[Stream ${id}] Attempting to connect to YouTube stream..."
        
        # Try streamlink first (often works better for YouTube live)
        streamlink --stdout "${options.sourceUrl}" best --retry-streams 30 --retry-max 10 2>/dev/null | \
          ffmpeg -re -i pipe:0 -c:v copy -c:a aac -ar 44100 -b:a 128k -f flv ${rtmpUrl} 2>&1
        
        # If streamlink fails, try yt-dlp with different options
        if [ $? -ne 0 ]; then
          echo "[Stream ${id}] Streamlink failed, trying yt-dlp..."
          yt-dlp --no-warnings -f "best[height<=1080]/best" -o - \
            --ignore-errors --no-abort-on-error \
            --extractor-retries 5 --fragment-retries 5 \
            "${options.sourceUrl}" 2>/dev/null | \
            ffmpeg -re -i pipe:0 -c:v copy -c:a aac -ar 44100 -b:a 128k -f flv ${rtmpUrl} 2>&1
        fi
        
        echo "[Stream ${id}] Stream ended or failed, retrying in 5 seconds..."
        sleep 5
      done
    `.trim();
  } else {
    // Use streamlink for Twitch and other platforms with retry
    command = `
      while true; do
        echo "[Stream ${id}] Connecting to stream..."
        streamlink --stdout "${options.sourceUrl}" ${quality} --retry-streams 30 --retry-max 10 2>/dev/null | \
          ffmpeg -re -i pipe:0 -c:v copy -c:a aac -b:a 128k -f flv ${rtmpUrl} 2>&1
        echo "[Stream ${id}] Stream ended, retrying in 5 seconds..."
        sleep 5
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