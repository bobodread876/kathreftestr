const { SimplePool } = require('nostr-tools/pool');
const nip19 = require('nostr-tools/nip19');

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.current.fyi',
  'wss://nostr.wine'
];

async function findStream() {
  const npub = 'npub1euahzfcw95ryyujz9unza7s4m2lsz363pz7xr5nlmwf6d04w2q7q5zd929';
  const { type, data: pubkey } = nip19.decode(npub);
  
  console.log('Looking for events from pubkey:', pubkey);
  
  const pool = new SimplePool();
  
  const filters = {
    kinds: [30311],
    authors: [pubkey],
    limit: 10
  };
  
  console.log('Using filters:', filters);
  
  try {
    const events = await pool.querySync(RELAYS, filters);
    console.log(`Found ${events.length} events`);
    
    if (events.length > 0) {
      events.forEach((event, i) => {
        console.log(`\nEvent ${i + 1}:`);
        console.log('ID:', event.id);
        console.log('Created:', new Date(event.created_at * 1000));
        console.log('Tags:', JSON.stringify(event.tags, null, 2));
      });
    } else {
      console.log('No events found. The event may not have been published correctly.');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    pool.close(RELAYS);
  }
}

findStream();