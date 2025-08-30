const { spawn } = require('child_process');
const { existsSync } = require('fs');

// Start MediaMTX first if in production
if (process.env.NODE_ENV === 'production') {
  const mediamtxPath = '/usr/local/bin/mediamtx';
  const configPath = '/etc/mediamtx.yml';
  
  if (existsSync(mediamtxPath)) {
    console.log('Starting MediaMTX server...');
    
    const mediamtx = spawn(mediamtxPath, [configPath], {
      stdio: 'inherit',
      detached: false,
    });
    
    mediamtx.on('error', (err) => {
      console.error('Failed to start MediaMTX:', err);
    });
    
    // Wait for MediaMTX to start
    setTimeout(() => {
      console.log('MediaMTX should be running, starting Next.js...');
      startNextJs();
    }, 3000);
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
    process.exit(1);
  });
  
  next.on('exit', (code) => {
    process.exit(code);
  });
}