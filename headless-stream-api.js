const HeadlessStreamer = require('./headless-stream');

// Parse command line arguments
const args = process.argv.slice(2);
const url = args[0];
const streamId = args[1];

if (!url || !streamId) {
  console.error('Usage: node headless-stream-api.js <url> <streamId> [options]');
  process.exit(1);
}

// Parse options
const options = {
  streamId,
  publishToNostr: args.includes('--publish')
};

// Extract title if provided
const titleIndex = args.indexOf('--title');
if (titleIndex !== -1 && args[titleIndex + 1]) {
  options.title = args[titleIndex + 1];
}

// Extract nsec if provided
const nsecIndex = args.indexOf('--nsec');
if (nsecIndex !== -1 && args[nsecIndex + 1]) {
  options.nsec = args[nsecIndex + 1];
}

const streamer = new HeadlessStreamer();

(async () => {
  try {
    await streamer.initialize();
    
    const result = await streamer.startStream(url, options);
    
    // Output metadata for API to capture
    if (result.title) console.log(`Video Title: ${result.title}`);
    if (result.channelName) console.log(`Channel: ${result.channelName}`);
    if (result.thumbnail) console.log(`Thumbnail: ${result.thumbnail}`);
    
    console.log('Stream started:', JSON.stringify(result));
    
    // Keep running until interrupted
    process.on('SIGINT', async () => {
      console.log('\nStopping stream...');
      await streamer.cleanup();
      process.exit(0);
    });
    
    // Prevent the process from exiting
    setInterval(() => {}, 1000);
    
  } catch (error) {
    console.error('Fatal error:', error);
    await streamer.cleanup();
    process.exit(1);
  }
})();