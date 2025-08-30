const { spawn } = require('child_process');
const { existsSync } = require('fs');

let mediamtxProcess = null;

// Start MediaMTX first if in production
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
    
    // Start Next.js after a short delay
    setTimeout(() => {
      console.log('Starting Next.js application...');
      startNextJs();
    }, 2000);
  } else {
    console.log('MediaMTX not found, starting Next.js directly...');
    startNextJs();
  }
} else {
  startNextJs();
}

function startNextJs() {
  // Start Next.js
  const next = spawn('npm', ['run', 'start:next'], {
    stdio: 'inherit',
    shell: true,
  });
  
  next.on('error', (err) => {
    console.error('Failed to start Next.js:', err);
    cleanup();
    process.exit(1);
  });
  
  next.on('exit', (code) => {
    cleanup();
    process.exit(code);
  });
}

function cleanup() {
  if (mediamtxProcess) {
    console.log('Stopping MediaMTX...');
    mediamtxProcess.kill();
  }
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);