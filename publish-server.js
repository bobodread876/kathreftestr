const WebSocket = require('ws');
global.WebSocket = WebSocket;

const { SimplePool } = require('nostr-tools/pool');
const { generateSecretKey, getPublicKey, finalizeEvent } = require('nostr-tools/pure');
const nip19 = require('nostr-tools/nip19');

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.current.fyi',
  'wss://nostr.wine'
];

async function publishStream(streamUrl, options = {}) {
  console.log('Publishing stream:', streamUrl);
  
  let privateKey, publicKey, nsec, npub;
  
  // Use provided nsec or generate new keypair
  if (options.nsec) {
    console.log('Using provided nsec...');
    try {
      const decoded = nip19.decode(options.nsec);
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec format');
      }
      privateKey = decoded.data;
      publicKey = getPublicKey(privateKey);
      nsec = options.nsec;
      npub = nip19.npubEncode(publicKey);
    } catch (error) {
      console.error('Error decoding nsec:', error);
      process.exit(1);
    }
  } else {
    console.log('Generating new keypair...');
    privateKey = generateSecretKey();
    publicKey = getPublicKey(privateKey);
    nsec = nip19.nsecEncode(privateKey);
    npub = nip19.npubEncode(publicKey);
  }
  
  console.log('Generated npub:', npub);
  console.log('Save this nsec to republish updates:', nsec);
  
  // Generate Lightning address
  const lightningAddress = `${npub}@npub.cash`;
  console.log('Lightning address:', lightningAddress);
  
  // Initialize pool
  const pool = new SimplePool();
  
  // First, publish profile metadata with Lightning address (kind 0)
  const profileEvent = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({
      name: options.channelName || 'Stream Bot',
      about: options.channelName ? `Streaming from ${options.channelName}` : 'Automated streaming to Nostr',
      picture: options.thumbnail || '',
      lud16: lightningAddress, // Lightning address in profile
      nip05: ''
    })
  };
  
  const signedProfile = finalizeEvent(profileEvent, privateKey);
  console.log('Publishing profile with Lightning address...');
  
  // Publish profile to relays first
  for (const relay of RELAYS) {
    try {
      const relayObj = await pool.ensureRelay(relay);
      await relayObj.publish(signedProfile);
      console.log(`✅ Profile published to ${relay}`);
    } catch (error) {
      console.log(`❌ Failed to publish profile to ${relay}`);
    }
  }
  
  // Wait a moment for profile to propagate
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Create NIP-53 live event
  const streamId = 'stream-' + Date.now();
  const title = options.title || `Echoes of the Bifröst ${streamId}`;
  
  const tags = [
    ['d', streamId],
    ['title', title],
    ['summary', options.summary || `Live streaming to Nostr via self-hosted infrastructure. Zap this creator if you want to see them stream more on NOSTR! To see the original stream, please visit: ${options.originalUrl || ''}`],
    ['streaming', streamUrl],
    ['status', 'live'],
    ['starts', Math.floor(Date.now() / 1000).toString()],
    ['p', publicKey, '', 'Host'], // Mark ourselves as the host
  ];
  
  // Add thumbnail/image tag if provided
  if (options.thumbnail) {
    tags.push(['image', options.thumbnail]);
    console.log('Including thumbnail:', options.thumbnail);
  }
  
  const eventTemplate = {
    kind: 30311,
    created_at: Math.floor(Date.now() / 1000),
    tags: tags,
    content: JSON.stringify({
      url: streamUrl,
      type: 'hls'
    })
  };
  
  const signedEvent = finalizeEvent(eventTemplate, privateKey);
  console.log('Event ID:', signedEvent.id);
  
  // Generate naddr for zap.stream URL
  const naddrData = {
    identifier: streamId,
    pubkey: publicKey,
    kind: 30311,
    relays: RELAYS.slice(0, 3) // Use first 3 relays
  };
  const naddr = nip19.naddrEncode(naddrData);
  console.log('Generated naddr:', naddr);
  
  // Publish to relays
  const successes = [];
  const failures = [];
  
  for (const relay of RELAYS) {
    try {
      console.log(`Connecting to ${relay}...`);
      const relayObj = await pool.ensureRelay(relay);
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout after 10 seconds'));
        }, 10000);
        
        relayObj.publish(signedEvent)
          .then(() => {
            clearTimeout(timeout);
            console.log(`✅ Published to ${relay}`);
            successes.push(relay);
            resolve();
          })
          .catch((err) => {
            clearTimeout(timeout);
            console.error(`❌ Failed to publish to ${relay}:`, err.message);
            failures.push({ relay, error: err.message });
            resolve(); // Don't reject, continue with other relays
          });
      });
      
      // Small delay between publishes
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`❌ Error with ${relay}:`, error.message);
      failures.push({ relay, error: error.message });
    }
  }
  
  console.log('\n=== Publishing Results ===');
  console.log(`Successful: ${successes.length}/${RELAYS.length}`);
  console.log('Successes:', successes);
  if (failures.length > 0) {
    console.log('Failures:', failures);
  }
  
  console.log('\n=== Stream Info ===');
  console.log('npub:', npub);
  console.log('Lightning address:', lightningAddress);
  console.log('Stream URL:', streamUrl);
  console.log('Event ID:', signedEvent.id);
  
  // Verify the event is on relays
  console.log('\n=== Verifying Event ===');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for propagation
  
  const filters = {
    kinds: [30311],
    authors: [publicKey],
    limit: 1
  };
  
  const verifyEvents = await pool.querySync(successes, filters);
  if (verifyEvents.length > 0) {
    console.log('✅ Event verified on relays!');
  } else {
    console.log('⚠️ Event not found on relays yet. It may take a few moments to propagate.');
  }
  
  pool.close(RELAYS);
  return { npub, nsec, eventId: signedEvent.id, successes, failures };
}

// Parse command line arguments
const args = process.argv.slice(2);
const streamUrl = args[0] || 'http://localhost:8890/live/test/index.m3u8';

// Parse options from remaining args
const options = {};
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--nsec' && args[i + 1]) {
    options.nsec = args[i + 1];
    i++;
  } else if (args[i] === '--title' && args[i + 1]) {
    options.title = args[i + 1];
    i++;
  } else if (args[i] === '--summary' && args[i + 1]) {
    options.summary = args[i + 1];
    i++;
  } else if (args[i] === '--thumbnail' && args[i + 1]) {
    options.thumbnail = args[i + 1];
    i++;
  } else if (args[i] === '--channelName' && args[i + 1]) {
    options.channelName = args[i + 1];
    i++;
  } else if (args[i] === '--originalUrl' && args[i + 1]) {
    options.originalUrl = args[i + 1];
    i++;
  }
}

// Show usage if no URL provided
if (!args[0]) {
  console.log('Usage: node publish-server.js <stream-url> [--nsec <nsec>] [--title "Stream Title"] [--summary "Description"] [--thumbnail <url>] [--channelName "Channel Name"]');
  console.log('\nExample:');
  console.log('  node publish-server.js http://localhost:8890/live/abc123/index.m3u8 --title "My Stream"');
  console.log('  node publish-server.js http://localhost:8890/live/abc123/index.m3u8 --nsec nsec1... --title "My Stream" --thumbnail https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg --channelName "My Channel"');
  process.exit(1);
}

publishStream(streamUrl, options)
  .then(result => {
    console.log('\n=== Done ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });