import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface HealthCheck {
  status: 'ok' | 'error' | 'degraded';
  checks: {
    app: 'ok' | 'error';
    mediamtx: 'ok' | 'error' | 'unknown';
    ffmpeg: 'ok' | 'error' | 'unknown';
    ytdlp: 'ok' | 'error' | 'unknown';
  };
  version?: string;
  uptime?: number;
  timestamp: string;
  environment: string;
}

export async function GET() {
  const startTime = Date.now();

  const health: HealthCheck = {
    status: 'ok',
    checks: { app: 'ok', mediamtx: 'unknown', ffmpeg: 'unknown', ytdlp: 'unknown' },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
  };

  try {
    health.version = require('../../../package.json').version || 'unknown';
  } catch {
    health.version = 'unknown';
  }

  // MediaMTX (HLS server)
  try {
    const res = await fetch('http://localhost:8888/v3/config/get', { signal: AbortSignal.timeout(5000) });
    health.checks.mediamtx = res.ok ? 'ok' : 'error';
  } catch {
    try {
      const { stdout } = await execAsync('pgrep -f mediamtx');
      health.checks.mediamtx = stdout.trim() ? 'ok' : 'error';
    } catch {
      health.checks.mediamtx = 'error';
    }
  }

  // ffmpeg (transcode) and yt-dlp (extraction) — the pipeline's two tools
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    health.checks.ffmpeg = stdout.includes('ffmpeg version') ? 'ok' : 'error';
  } catch {
    health.checks.ffmpeg = 'error';
  }
  try {
    const { stdout } = await execAsync('yt-dlp --version');
    health.checks.ytdlp = stdout.trim().length > 0 ? 'ok' : 'error';
  } catch {
    health.checks.ytdlp = 'error';
  }

  const anyError = Object.values(health.checks).some((s) => s === 'error');
  if (health.checks.app !== 'ok' || health.checks.ffmpeg === 'error' || health.checks.ytdlp === 'error') {
    health.status = 'error';
  } else if (anyError) {
    health.status = 'degraded';
  }

  return NextResponse.json(
    { ...health, responseTime: `${Date.now() - startTime}ms` },
    {
      status: health.status === 'ok' ? 200 : health.status === 'degraded' ? 206 : 503,
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'X-Health-Status': health.status },
    },
  );
}

export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { 'X-Health-Status': 'ok' } });
}
