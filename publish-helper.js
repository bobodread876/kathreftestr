#!/usr/bin/env node

// Helper script to publish streams with metadata passed from browser
// This can be called by ws-server.js when receiving metadata

const { spawn } = require('child_process');
const path = require('path');

function publishStream(metadata) {
  const { streamId, title, nsec, streamUrl } = metadata;
  
  if (!streamUrl) {
    console.error('No stream URL provided');
    return;
  }
  
  // Build command arguments
  const args = [path.join(__dirname, 'publish-server.js'), streamUrl];
  
  if (title) {
    args.push('--title', title);
  }
  
  if (nsec) {
    args.push('--nsec', nsec);
  }
  
  console.log('Publishing with args:', args);
  
  // Spawn the publish process
  const publishProcess = spawn('node', args, {
    stdio: 'inherit' // Pass through all output
  });
  
  publishProcess.on('exit', (code) => {
    if (code === 0) {
      console.log('Stream published successfully');
    } else {
      console.error('Failed to publish stream, exit code:', code);
    }
  });
  
  return publishProcess;
}

// If called directly with command line args
if (require.main === module) {
  const metadata = {
    streamUrl: process.argv[2],
    title: process.argv[3],
    nsec: process.argv[4]
  };
  
  if (!metadata.streamUrl) {
    console.log('Usage: node publish-helper.js <streamUrl> [title] [nsec]');
    process.exit(1);
  }
  
  publishStream(metadata);
}

module.exports = { publishStream };