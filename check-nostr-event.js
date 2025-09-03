const WebSocket = require('ws');
global.WebSocket = WebSocket;

const { SimplePool } = require('nostr-tools/pool');
const nip19 = require('nostr-tools/nip19');

async function checkEvent(npubStr) {
  const decoded = nip19.decode(npubStr);
  const pubkey = decoded.data;
  
  const pool = new SimplePool();
  
  const filters = {
    kinds: [30311],
    authors: [pubkey],
    limit: 1
  };
  
  console.log('Fetching events for:', npubStr);
  
  const events = await pool.querySync(['wss://relay.damus.io'], filters);
  
  if (events.length > 0) {
    const event = events[0];
    console.log('\nEvent found!');
    console.log('Title:', event.tags.find(t => t[0] === 'title')?.[1]);
    console.log('Summary:', event.tags.find(t => t[0] === 'summary')?.[1]);
    console.log('Stream URL:', event.tags.find(t => t[0] === 'streaming')?.[1]);
  } else {
    console.log('No events found');
  }
  
  pool.close(['wss://relay.damus.io']);
}

// Get npub from command line argument
const npub = process.argv[2];
if (!npub) {
  console.log('Usage: node check-nostr-event.js <npub>');
  process.exit(1);
}

checkEvent(npub).catch(console.error);