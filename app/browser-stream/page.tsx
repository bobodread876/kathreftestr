'use client';

import { useState, useRef, useEffect } from 'react';

export default function BrowserStreamPage() {
  const [streamUrl, setStreamUrl] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamId, setStreamId] = useState('');
  const [status, setStatus] = useState('');
  const [npub, setNpub] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);

  const startBrowserStream = async () => {
    try {
      setStatus('Starting browser-based stream...');
      
      // First, get stream metadata from server
      const response = await fetch('/api/browser-stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: streamUrl || 'Browser Screen Capture'
        })
      });

      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to start stream');
      }

      setStreamId(data.stream.id);
      setNpub(data.nostr.npub);
      
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

      // Connect to WebSocket server on same port via /api/ws path
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/ws`;
      
      const ws = new WebSocket(wsUrl);
      websocketRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        // Send metadata first
        ws.send(JSON.stringify({ streamId: data.stream.id }));
      };
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.status === 'ready') {
          console.log('Server ready to receive stream');
          setStatus(`Streaming! View at: https://zap.stream/${data.nostr.npub}`);
          setIsStreaming(true);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus('WebSocket connection error');
      };
      
      // Start MediaRecorder to capture and send video
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2000000
      });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(event.data);
        }
      };
      
      // Start recording in chunks
      mediaRecorder.start(100); // Send data every 100ms
      
      // Handle stream end
      stream.getTracks()[0].addEventListener('ended', () => {
        stopStream();
      });

    } catch (error) {
      console.error('Error starting stream:', error);
      setStatus(`Error: ${error}`);
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
                YouTube/Twitch URL (for metadata)
              </label>
              <input
                type="url"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                disabled={isStreaming}
              />
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
            {npub && (
              <div className="mt-3">
                <p className="text-sm mb-2">View your stream on zap.stream:</p>
                <a 
                  href={`https://zap.stream/${npub}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-semibold"
                >
                  Open on zap.stream →
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}