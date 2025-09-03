import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface HealthCheck {
  status: 'ok' | 'error' | 'degraded';
  checks: {
    app: 'ok' | 'error';
    mediamtx: 'ok' | 'error' | 'unknown';
    websocket: 'ok' | 'error' | 'unknown';
    ffmpeg: 'ok' | 'error' | 'unknown';
    ytdlp: 'ok' | 'error' | 'unknown';
    streamlink: 'ok' | 'error' | 'unknown';
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
    checks: {
      app: 'ok',
      mediamtx: 'unknown',
      websocket: 'unknown',
      ffmpeg: 'unknown',
      ytdlp: 'unknown',
      streamlink: 'unknown'
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  };

  try {
    // Get version from package.json
    const packageJson = require('../../../package.json');
    health.version = packageJson.version || 'unknown';
  } catch {
    health.version = 'unknown';
  }

  // Check MediaMTX
  try {
    const mediamtxResponse = await fetch('http://localhost:8888/v3/config/get', {
      signal: AbortSignal.timeout(5000)
    });
    health.checks.mediamtx = mediamtxResponse.ok ? 'ok' : 'error';
  } catch {
    // Try alternative MediaMTX health check
    try {
      const { stdout } = await execAsync('pgrep -f mediamtx');
      health.checks.mediamtx = stdout.trim() ? 'ok' : 'error';
    } catch {
      health.checks.mediamtx = 'error';
    }
  }

  // Check WebSocket server
  try {
    const wsResponse = await fetch('http://localhost:8082', {
      signal: AbortSignal.timeout(2000)
    });
    // WebSocket server returns 426 Upgrade Required for HTTP requests
    health.checks.websocket = wsResponse.status === 426 ? 'ok' : 'error';
  } catch {
    // Try checking if process is running
    try {
      const { stdout } = await execAsync('pgrep -f "ws-server.js"');
      health.checks.websocket = stdout.trim() ? 'ok' : 'error';
    } catch {
      health.checks.websocket = 'error';
    }
  }

  // Check ffmpeg
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    health.checks.ffmpeg = stdout.includes('ffmpeg version') ? 'ok' : 'error';
  } catch {
    health.checks.ffmpeg = 'error';
  }

  // Check yt-dlp
  try {
    const { stdout } = await execAsync('yt-dlp --version');
    health.checks.ytdlp = stdout.trim().length > 0 ? 'ok' : 'error';
  } catch {
    health.checks.ytdlp = 'error';
  }

  // Check streamlink
  try {
    const { stdout } = await execAsync('streamlink --version');
    health.checks.streamlink = stdout.includes('streamlink') ? 'ok' : 'error';
  } catch {
    health.checks.streamlink = 'error';
  }

  // Determine overall health status
  const criticalServices = ['app', 'mediamtx', 'websocket', 'ffmpeg', 'ytdlp'];
  const criticalOk = criticalServices.every(
    service => health.checks[service as keyof typeof health.checks] === 'ok'
  );
  
  const anyError = Object.values(health.checks).some(status => status === 'error');
  
  if (!criticalOk) {
    health.status = 'error';
  } else if (anyError) {
    health.status = 'degraded';
  }

  // Add response time
  const responseTime = Date.now() - startTime;

  return NextResponse.json(
    {
      ...health,
      responseTime: `${responseTime}ms`
    },
    { 
      status: health.status === 'ok' ? 200 : health.status === 'degraded' ? 206 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Status': health.status
      }
    }
  );
}

// Simple HEAD request support for lightweight health checks
export async function HEAD() {
  return new NextResponse(null, { 
    status: 200,
    headers: {
      'X-Health-Status': 'ok'
    }
  });
}