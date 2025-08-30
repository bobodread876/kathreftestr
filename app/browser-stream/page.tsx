'use client';

import { useState, useRef, useEffect } from 'react';

export default function BrowserStreamPage() {
  const [streamUrl, setStreamUrl] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamId, setStreamId] = useState('');
  const [status, setStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const startBrowserStream = async () => {
    try {
      setStatus('Starting browser-based stream...');
      
      // Option 1: Screen capture (includes audio)
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

      // Create WebRTC connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      // Add tracks to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to server and get stream details
      const response = await fetch('/api/browser-stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: streamUrl,
          sdp: offer.sdp
        })
      });

      const data = await response.json();
      
      if (data.ok) {
        setStreamId(data.stream.id);
        setIsStreaming(true);
        setStatus(`Streaming! HLS: ${data.stream.hls}`);
        
        // Set remote description
        if (data.sdp) {
          await pc.setRemoteDescription({
            type: 'answer',
            sdp: data.sdp
          });
        }
      } else {
        throw new Error(data.error || 'Failed to start stream');
      }

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
    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
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
            <p className="text-sm">Check zap.stream for your stream</p>
          </div>
        )}
      </div>
    </div>
  );
}