'use client';

import { useState, useRef, useEffect } from 'react';

export default function BrowserStreamPage() {
  const [streamUrl, setStreamUrl] = useState('');
  const [streamTitle, setStreamTitle] = useState('');
  const [userNsec, setUserNsec] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamId, setStreamId] = useState('');
  const [status, setStatus] = useState('');
  const [npub, setNpub] = useState('');
  const [naddr, setNaddr] = useState('');
  const [generatedNsec, setGeneratedNsec] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [youtubeMetadata, setYoutubeMetadata] = useState<any>(null);
  const [channelName, setChannelName] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);

  // Extract YouTube video ID and generate thumbnail URL
  const extractYouTubeThumbnail = (url: string) => {
    if (!url) return null;
    
    // Extract video ID from various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^#&?]*)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        const videoId = match[1];
        // Use high quality thumbnail
        return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }
    
    return null;
  };

  // Fetch YouTube metadata when URL changes
  useEffect(() => {
    if (!streamUrl) return;
    
    const fetchMetadata = async () => {
      try {
        const response = await fetch('/api/youtube-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: streamUrl })
        });
        
        if (response.ok) {
          const metadata = await response.json();
          console.log('Fetched YouTube metadata:', metadata);
          
          setYoutubeMetadata(metadata);
          setThumbnailUrl(metadata.thumbnail);
          setChannelName(metadata.channelName);
          
          // Auto-populate title if not already set
          if (!streamTitle && metadata.title) {
            setStreamTitle(metadata.title);
          }
        }
      } catch (error) {
        console.error('Error fetching YouTube metadata:', error);
        // Fall back to just extracting thumbnail
        const thumbnail = extractYouTubeThumbnail(streamUrl);
        if (thumbnail) {
          setThumbnailUrl(thumbnail);
        }
      }
    };
    
    fetchMetadata();
  }, [streamUrl]);

  const startBrowserStream = async () => {
    try {
      setStatus('Starting browser-based stream...');
      
      // First, get stream metadata from server
      console.log('Requesting stream metadata from server...');
      const response = await fetch('/api/browser-stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: streamUrl || 'Browser Screen Capture'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error:', response.status, errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Stream metadata received:', data);
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to start stream');
      }

      if (!data.stream?.id) {
        throw new Error('No stream ID received from server');
      }

      setStreamId(data.stream.id);
      setNpub(data.nostr?.npub || '');
      
      // Screen capture (includes audio)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      mediaStreamRef.current = stream;
      
      // Show preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Connect to separate WebSocket server on port 8082
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname;
      const wsUrl = `${wsProtocol}//${wsHost}:8082`;
      
      console.log('Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      websocketRef.current = ws;
      
      // Keep WebSocket alive
      const keepAliveInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          // Send a ping-like message to keep connection alive
          console.log('Keeping WebSocket alive');
        }
      }, 30000);
      
      ws.onopen = () => {
        console.log('WebSocket connected, readyState:', ws.readyState);
        // Add a small delay to ensure connection is stable
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const streamMetadata = { 
              streamId: data.stream.id,
              title: streamTitle || `Echoes of the Bifröst ${data.stream.id}`,
              nsec: userNsec || '',
              thumbnail: thumbnailUrl || '',
              channelName: channelName || '',
              summary: youtubeMetadata?.title ? `Streaming: ${youtubeMetadata.title}` : ''
            };
            console.log('Sending stream metadata:', streamMetadata);
            try {
              ws.send(JSON.stringify(streamMetadata));
              console.log('Metadata sent successfully');
              
              // Store generated nsec if new identity was created and no user nsec provided
              if (!userNsec && data.nostr?.nsec) {
                setGeneratedNsec(data.nostr.nsec);
              }
            } catch (e) {
              console.error('Error sending metadata:', e);
              setStatus('Failed to send stream metadata');
            }
          } else {
            console.error('WebSocket closed before metadata could be sent, state:', ws.readyState);
            setStatus('WebSocket closed before metadata could be sent');
          }
        }, 2000);
      };
      
      ws.onmessage = (event) => {
        console.log('WebSocket message received:', event.data);
        try {
          const msg = JSON.parse(event.data);
          console.log('Parsed message:', msg);
          
          if (msg.type === 'test') {
            console.log('Test message from server:', msg.message);
          }
          
          if (msg.type === 'nostr-info') {
            console.log('Received Nostr info:', msg);
            if (msg.npub) {
              setNpub(msg.npub);
            }
            if (msg.naddr) {
              setNaddr(msg.naddr);
              console.log('Stored naddr for zap.stream:', msg.naddr);
            }
            if (msg.nsec && !userNsec) {
              setGeneratedNsec(msg.nsec);
              console.log('Stored generated nsec:', msg.nsec);
            }
          }
          
          if (msg.status === 'ready') {
            console.log('Server ready to receive stream');
            setStatus(`Streaming! View at: https://zap.stream/${npub || data.nostr?.npub}`);
            setIsStreaming(true);
            
            // Start sending video data after server is ready
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
              mediaRecorderRef.current.start(100);
            }
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus('WebSocket connection error - check browser console');
      };
      
      ws.onclose = (event) => {
        clearInterval(keepAliveInterval);
        console.log('WebSocket closed:', event.code, event.reason);
        console.log('WebSocket was clean:', event.wasClean);
        console.log('WebSocket readyState:', ws.readyState);
        if (!event.wasClean) {
          setStatus(`WebSocket closed unexpectedly: ${event.reason || 'Unknown reason'}`);
        }
        // Try to stop MediaRecorder if still running
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          console.log('Stopping MediaRecorder due to WebSocket close');
          mediaRecorderRef.current.stop();
        }
      };
      
      // Start MediaRecorder to capture and send video
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2000000
      });
      mediaRecorderRef.current = mediaRecorder;
      
      let chunksCount = 0;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          chunksCount++;
          console.log(`Sending video chunk #${chunksCount}, size: ${event.data.size}`);
          ws.send(event.data);
        } else if (ws.readyState !== WebSocket.OPEN) {
          console.log('WebSocket not open, cannot send chunk');
        }
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setStatus('MediaRecorder error - check console');
      };
      
      mediaRecorder.onstart = () => {
        console.log('MediaRecorder started');
      };
      
      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped');
      };
      
      // Don't start recording yet - wait for server ready signal
      // mediaRecorder.start(100); will be called when server sends ready
      
      // Handle stream end
      stream.getTracks()[0].addEventListener('ended', () => {
        stopStream();
      });

    } catch (error: any) {
      console.error('Error starting stream:', error);
      setStatus(`Error: ${error.message || error}`);
      
      // Clean up on error
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
    }
  };

  const stopStream = async () => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close WebSocket
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    // Stop stream on server
    if (streamId) {
      await fetch('/api/browser-stream/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId })
      });
    }

    setIsStreaming(false);
    setStatus('Stream stopped');
    setStreamId('');
    setNpub('');
    setNaddr('');
    setGeneratedNsec('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Browser-Based Streaming</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <p className="text-gray-300 mb-4">
            This method captures your screen/tab and streams it to Nostr, bypassing YouTube restrictions.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Stream Title (optional)
              </label>
              <input
                type="text"
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                placeholder="Echoes of the Bifröst"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                disabled={isStreaming}
              />
              <p className="text-xs text-gray-400 mt-1">
                Leave empty for default: "Echoes of the Bifröst [Stream ID]"
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Your Nostr nsec (optional - for persistent identity)
              </label>
              <input
                type="password"
                value={userNsec}
                onChange={(e) => setUserNsec(e.target.value)}
                placeholder="nsec1..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                disabled={isStreaming}
              />
              <p className="text-xs text-gray-400 mt-1">
                Leave empty to generate a new identity for this stream
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                YouTube/Twitch URL (for thumbnail)
              </label>
              <input
                type="url"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                disabled={isStreaming}
              />
              {(thumbnailUrl || channelName) && (
                <div className="mt-2 space-y-2">
                  {channelName && (
                    <div>
                      <p className="text-xs text-gray-400">Channel: <span className="text-gray-300">{channelName}</span></p>
                    </div>
                  )}
                  {thumbnailUrl && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Thumbnail preview:</p>
                      <img 
                        src={thumbnailUrl} 
                        alt="Stream thumbnail" 
                        className="w-32 h-auto rounded"
                        onError={(e) => {
                          console.log('Thumbnail failed to load, trying default quality');
                          e.currentTarget.src = thumbnailUrl.replace('maxresdefault', 'hqdefault');
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-4">
              {!isStreaming ? (
                <button
                  onClick={startBrowserStream}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
                >
                  Start Screen Capture
                </button>
              ) : (
                <button
                  onClick={stopStream}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold"
                >
                  Stop Streaming
                </button>
              )}
            </div>

            {status && (
              <div className="p-4 bg-gray-700 rounded-lg">
                <p className="text-sm">{status}</p>
              </div>
            )}
          </div>
        </div>

        {/* Video Preview */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Stream Preview</h2>
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full rounded-lg bg-black"
            style={{ maxHeight: '400px' }}
          />
        </div>

        {isStreaming && streamId && (
          <div className="mt-6 p-4 bg-green-900 rounded-lg">
            <p className="font-semibold">Stream is Live!</p>
            <p className="text-sm mt-2">Stream ID: {streamId}</p>
            <p className="text-sm mt-1">Title: {streamTitle || `Echoes of the Bifröst ${streamId}`}</p>
            {npub && (
              <div className="mt-3">
                <p className="text-sm mb-2">Your npub: {npub}</p>
                {generatedNsec && !userNsec && (
                  <div className="mt-2 p-3 bg-yellow-900 rounded">
                    <p className="text-xs font-semibold mb-1">⚠️ Save this nsec (private key) to reuse this identity:</p>
                    <code className="text-xs break-all">{generatedNsec}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(generatedNsec)}
                      className="mt-2 px-3 py-1 bg-yellow-700 hover:bg-yellow-600 rounded text-xs"
                    >
                      Copy nsec
                    </button>
                  </div>
                )}
                <p className="text-sm mb-2 mt-3">View your stream on Nostr:</p>
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <a 
                      href="https://zap.stream"
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-semibold"
                    >
                      zap.stream
                    </a>
                    <a 
                      href="https://nostrudel.ninja/#/streams"
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold"
                    >
                      Nostrudel
                    </a>
                    <a 
                      href="/nostr-viewer"
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-semibold"
                    >
                      Local Viewer
                    </a>
                  </div>
                  <p className="text-xs text-gray-400">
                    Look for "{streamTitle || `Echoes of the Bifröst ${streamId}`}" in the live streams
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}