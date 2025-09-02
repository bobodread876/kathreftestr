'use client';

import { useState } from 'react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { finalizeEvent } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.current.fyi',
  'wss://nostr.wine'
];

export default function RepublishStream() {
  const [streamUrl, setStreamUrl] = useState('http://localhost:8890/live/b2d496f7/index.m3u8');
  const [status, setStatus] = useState('');
  const [npub, setNpub] = useState('');
  const [loading, setLoading] = useState(false);

  const publishStream = async () => {
    setLoading(true);
    setStatus('Generating keys...');
    
    try {
      // Generate new keypair for this stream
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);
      const nsec = nip19.nsecEncode(privateKey);
      const npubStr = nip19.npubEncode(publicKey);
      
      setNpub(npubStr);
      setStatus(`Generated npub: ${npubStr}`);
      
      // Create NIP-53 live event
      const streamId = 'test-' + Date.now();
      const eventTemplate = {
        kind: 30311,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', streamId],
          ['title', 'Browser Screen Capture Test'],
          ['summary', 'Testing browser-based streaming to Nostr'],
          ['streaming', streamUrl],
          ['status', 'live'],
          ['starts', Math.floor(Date.now() / 1000).toString()],
          ['p', '17538dc2a62769d09443f18c37cbe358fab5bbf981173542aa7c5ff171ed77c4'], // zap.stream pubkey
        ],
        content: JSON.stringify({
          url: streamUrl,
          type: 'hls'
        })
      };
      
      const signedEvent = finalizeEvent(eventTemplate, privateKey);
      
      setStatus('Publishing to relays...');
      
      // Publish to relays with better error handling
      const pool = new SimplePool();
      const pub = pool.publish(RELAYS, signedEvent);
      
      setStatus('Publishing to relays (this may take a few seconds)...');
      
      const results = await Promise.allSettled(
        RELAYS.map((relay) => 
          new Promise((resolve) => {
            const timeout = setTimeout(() => {
              resolve({ relay, success: false, error: 'Timeout' });
            }, 5000);
            
            pub.on(relay, () => {
              clearTimeout(timeout);
              console.log(`Published to ${relay}`);
              resolve({ relay, success: true });
            });
            
            pub.on('failed', (reason: any) => {
              if (reason.includes(relay)) {
                clearTimeout(timeout);
                console.error(`Failed to publish to ${relay}:`, reason);
                resolve({ relay, success: false, error: reason });
              }
            });
          })
        )
      );
      
      // Log results
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      setStatus(`Published to ${successCount}/${RELAYS.length} relays`);
      
      // Show detailed results
      const details = results.map((r, i) => {
        if (r.status === 'fulfilled') {
          return `${RELAYS[i]}: ${r.value.success ? '✅' : '❌'}`;
        } else {
          return `${RELAYS[i]}: ❌ Error`;
        }
      }).join('\n');
      
      setStatus(prev => prev + '\n\n' + details);
      
      pool.close(RELAYS);
      
    } catch (error: any) {
      console.error('Error publishing stream:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Republish Stream to Nostr</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Stream URL (HLS)
              </label>
              <input
                type="url"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg"
              />
            </div>
            
            <button
              onClick={publishStream}
              disabled={loading}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold disabled:opacity-50"
            >
              {loading ? 'Publishing...' : 'Publish Stream to Nostr'}
            </button>
          </div>
        </div>
        
        {npub && (
          <div className="bg-green-900 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-2">Stream Published!</h2>
            <p className="font-mono text-sm break-all mb-4">{npub}</p>
            <div className="space-x-4">
              <button
                onClick={() => navigator.clipboard.writeText(npub)}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded"
              >
                Copy npub
              </button>
              <a
                href={`https://nostrudel.ninja/#/streams`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                View on Nostrudel
              </a>
              <a
                href={`/nostr-viewer?npub=${npub}`}
                className="inline-block px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
              >
                View in Local Viewer
              </a>
            </div>
          </div>
        )}
        
        {status && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Status</h3>
            <pre className="text-sm whitespace-pre-wrap">{status}</pre>
          </div>
        )}
      </div>
    </div>
  );
}