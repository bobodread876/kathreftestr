'use client';

import { useState, useEffect } from 'react';
import { SimplePool, nip19, type Event } from 'nostr-tools';

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.current.fyi',
  'wss://nostr.wine'
];

export default function NostrViewer() {
  const [npub, setNpub] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [liveStreams, setLiveStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const fetchStreams = async () => {
    setLoading(true);
    setStatus('Connecting to Nostr relays...');
    
    try {
      const pool = new SimplePool();
      
      // If npub is provided, decode it to get the pubkey
      let filters: any = { kinds: [30311], limit: 50 };
      
      if (npub) {
        try {
          const { type, data } = nip19.decode(npub);
          if (type === 'npub') {
            filters.authors = [data as string];
            setStatus(`Searching for streams from: ${npub}`);
          }
        } catch (e) {
          setStatus(`Invalid npub: ${npub}`);
        }
      }
      
      // Add time filter to get recent events
      filters.since = Math.floor(Date.now() / 1000) - (24 * 60 * 60); // Last 24 hours
      
      setStatus('Fetching live streams...');
      console.log('Using filters:', filters);
      
      const events = await pool.querySync(RELAYS, filters);
      console.log(`Fetched ${events.length} events`);
      
      setEvents(events);
      
      // Parse live stream data
      const streams = events.map(event => {
        const dTag = event.tags.find(t => t[0] === 'd')?.[1];
        const title = event.tags.find(t => t[0] === 'title')?.[1] || 'Untitled Stream';
        const summary = event.tags.find(t => t[0] === 'summary')?.[1] || '';
        const image = event.tags.find(t => t[0] === 'image')?.[1];
        const status = event.tags.find(t => t[0] === 'status')?.[1];
        const streaming = event.tags.find(t => t[0] === 'streaming')?.[1];
        const starts = event.tags.find(t => t[0] === 'starts')?.[1];
        
        const author = nip19.npubEncode(event.pubkey);
        
        return {
          id: event.id,
          author,
          dTag,
          title,
          summary,
          image,
          status,
          streaming,
          starts,
          created: event.created_at,
          tags: event.tags,
          content: event.content
        };
      });
      
      setLiveStreams(streams);
      setStatus(`Found ${streams.length} live stream(s)`);
      
      pool.close(RELAYS);
    } catch (error: any) {
      console.error('Error fetching streams:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStreamUrl = (stream: any) => {
    // Look for streaming URL in tags
    const streamingUrl = stream.streaming;
    if (streamingUrl) {
      // If it's an HLS URL, return it directly
      if (streamingUrl.includes('.m3u8')) {
        return streamingUrl;
      }
      // If it's zap.stream, construct the HLS URL
      if (streamingUrl.includes('zap.stream')) {
        const npub = stream.author;
        return `https://data.zap.stream/stream/${npub}.m3u8`;
      }
    }
    // Fallback to local stream if it matches our stream
    if (stream.title?.includes('Browser Screen Capture') || stream.summary?.includes('b2d496f7')) {
      return 'http://localhost:8890/live/b2d496f7/index.m3u8';
    }
    return null;
  };

  useEffect(() => {
    // Auto-fetch on load
    fetchStreams();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Nostr Live Streams (NIP-53)</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={npub}
              onChange={(e) => setNpub(e.target.value)}
              placeholder="Enter npub to filter (leave empty for all)"
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg"
            />
            <button
              onClick={fetchStreams}
              disabled={loading}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Fetch Streams'}
            </button>
          </div>
          
          {status && (
            <div className="p-3 bg-gray-700 rounded text-sm">
              {status}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {liveStreams.map((stream) => (
            <div key={stream.id} className="bg-gray-800 rounded-lg p-6">
              <div className="flex gap-4">
                {stream.image && (
                  <img 
                    src={stream.image} 
                    alt={stream.title}
                    className="w-32 h-32 object-cover rounded"
                  />
                )}
                <div className="flex-1">
                  <h2 className="text-xl font-semibold mb-2">{stream.title}</h2>
                  <p className="text-gray-400 text-sm mb-2">{stream.summary}</p>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>Author: {stream.author}</p>
                    <p>Status: {stream.status || 'live'}</p>
                    <p>Created: {new Date(stream.created * 1000).toLocaleString()}</p>
                    {stream.streaming && (
                      <p>Stream URL: {stream.streaming}</p>
                    )}
                  </div>
                  
                  {getStreamUrl(stream) && (
                    <div className="mt-4">
                      <a
                        href={getStreamUrl(stream)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                      >
                        Open Stream URL
                      </a>
                      <button
                        onClick={() => {
                          const url = getStreamUrl(stream);
                          if (url) {
                            navigator.clipboard.writeText(url);
                            setStatus('Stream URL copied to clipboard');
                          }
                        }}
                        className="ml-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                      >
                        Copy URL
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
                  View Raw Event Data
                </summary>
                <pre className="mt-2 p-3 bg-gray-900 rounded text-xs overflow-auto">
                  {JSON.stringify(stream, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>

        {liveStreams.length === 0 && !loading && (
          <div className="text-center text-gray-500 mt-8">
            No live streams found. Make sure you're streaming and the event was published to Nostr.
          </div>
        )}
      </div>
    </div>
  );
}