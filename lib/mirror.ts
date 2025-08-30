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
  const hlsBase = process.env.HLS_BASE || "http://localhost:8888/live";
  const quality = options.quality || "best";
  
  const rtmpUrl = `${rtmpBase}/${id}`;
  const hlsUrl = `${hlsBase}/${id}/index.m3u8`;

  // Try yt-dlp first as it's more reliable for YouTube
  // Use streamlink as fallback for Twitch
  const isYouTube = options.sourceUrl.includes('youtube.com') || options.sourceUrl.includes('youtu.be');
  
  let command: string;
  if (isYouTube) {
    // For YouTube, try to get the direct URL first, then stream it
    // This is more reliable than piping from yt-dlp
    command = `yt-dlp -f best[ext=mp4]/best -g "${options.sourceUrl}" 2>/dev/null | head -1 | xargs -I {} ffmpeg -re -i {} -c:v copy -c:a aac -b:a 128k -f flv ${rtmpUrl} 2>&1`;
  } else {
    // Use streamlink for Twitch and other platforms
    command = `streamlink --stdout "${options.sourceUrl}" ${quality} 2>/dev/null | ffmpeg -re -i pipe:0 -c:v copy -c:a aac -b:a 128k -f flv ${rtmpUrl} 2>&1`;
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