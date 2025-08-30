import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';

let mediamtxProcess: ChildProcess | null = null;

export async function startMediaMTX(): Promise<void> {
  // Check if MediaMTX is already running
  if (mediamtxProcess && !mediamtxProcess.killed) {
    console.log('MediaMTX is already running');
    return;
  }

  // Check if MediaMTX binary exists
  const mediamtxPath = '/usr/local/bin/mediamtx';
  const configPath = '/etc/mediamtx.yml';
  
  if (!existsSync(mediamtxPath)) {
    console.error('MediaMTX binary not found at', mediamtxPath);
    console.log('Skipping MediaMTX startup - running in development mode');
    return;
  }

  console.log('Starting MediaMTX server...');
  
  mediamtxProcess = spawn(mediamtxPath, [configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  mediamtxProcess.stdout?.on('data', (data) => {
    console.log(`[MediaMTX] ${data.toString().trim()}`);
  });

  mediamtxProcess.stderr?.on('data', (data) => {
    console.error(`[MediaMTX Error] ${data.toString().trim()}`);
  });

  mediamtxProcess.on('exit', (code) => {
    console.log(`MediaMTX exited with code ${code}`);
    mediamtxProcess = null;
    // Restart MediaMTX if it crashes
    setTimeout(() => {
      console.log('Restarting MediaMTX...');
      startMediaMTX();
    }, 2000);
  });

  mediamtxProcess.on('error', (error) => {
    console.error('Failed to start MediaMTX:', error);
    mediamtxProcess = null;
  });

  // Wait for MediaMTX to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('MediaMTX should be ready now');
}

export function stopMediaMTX(): void {
  if (mediamtxProcess && !mediamtxProcess.killed) {
    console.log('Stopping MediaMTX...');
    mediamtxProcess.kill('SIGTERM');
    mediamtxProcess = null;
  }
}

// Auto-start MediaMTX when module is imported
if (process.env.NODE_ENV === 'production') {
  startMediaMTX().catch(console.error);
}

// Cleanup on exit
process.on('SIGINT', stopMediaMTX);
process.on('SIGTERM', stopMediaMTX);