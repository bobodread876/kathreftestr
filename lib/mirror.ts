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

  // Use streamlink for better stability with live streams
  // Fall back to yt-dlp if streamlink isn't available
  const command = process.platform === "win32" 
    ? `streamlink -O "${options.sourceUrl}" ${quality} | ffmpeg -v error -re -i pipe:0 -c:v copy -c:a aac -f flv ${rtmpUrl}`
    : `streamlink -O "${options.sourceUrl}" ${quality} 2>/dev/null | ffmpeg -v error -re -i pipe:0 -c:v copy -c:a aac -f flv ${rtmpUrl} 2>&1`;

  const shell = process.platform === "win32" ? "cmd" : "bash";
  const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];
  
  const proc = spawn(shell, shellArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  // Log output for debugging
  proc.stdout?.on("data", (data) => {
    console.log(`[Stream ${id}] stdout:`, data.toString());
  });

  proc.stderr?.on("data", (data) => {
    console.error(`[Stream ${id}] stderr:`, data.toString());
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
  for (const [id, handle] of RUNNING.entries()) {
    try {
      handle.proc.kill("SIGTERM");
    } catch (error) {
      console.error(`Failed to stop stream ${id}:`, error);
    }
  }
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