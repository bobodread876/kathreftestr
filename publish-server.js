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

async function publishStream(streamUrl) {
  console.log('Publishing stream:', streamUrl);
  
  // Generate new keypair
  const privateKey = generateSecretKey();
  const publicKey = getPublicKey(privateKey);
  const nsec = nip19.nsecEncode(privateKey);
  const npub = nip19.npubEncode(publicKey);
  
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
      name: 'Stream Bot',
      about: 'Automated streaming to Nostr',
      picture: '',
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
  const streamId = 'test-' + Date.now();
  const eventTemplate = {
    kind: 30311,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', streamId],
      ['title', 'Browser Screen Capture Test'],
      ['summary', 'Testing browser-based streaming to Nostr via local infrastructure'],
      ['streaming', streamUrl],
      ['status', 'live'],
      ['starts', Math.floor(Date.now() / 1000).toString()],
      ['p', publicKey, '', 'Host'], // Mark ourselves as the host
    ],
    content: JSON.stringify({
      url: streamUrl,
      type: 'hls'
    })
  };
  
  const signedEvent = finalizeEvent(eventTemplate, privateKey);
  console.log('Event ID:', signedEvent.id);
  
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

// Get stream URL from command line or use default
const streamUrl = process.argv[2] || 'http://localhost:8890/live/3699618f/index.m3u8';

publishStream(streamUrl)
  .then(result => {
    console.log('\n=== Done ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });