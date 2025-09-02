"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [streamUrl, setStreamUrl] = useState("");
  const [streamTitle, setStreamTitle] = useState("");
  const [userNsec, setUserNsec] = useState("");
  const [channelName, setChannelName] = useState("");
  const [status, setStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [npub, setNpub] = useState("");
  const [naddr, setNaddr] = useState("");
  const [generatedNsec, setGeneratedNsec] = useState("");
  const [youtubeMetadata, setYoutubeMetadata] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch YouTube metadata when URL changes
  useEffect(() => {
    if (!streamUrl) {
      setYoutubeMetadata(null);
      return;
    }
    
    // Check if it's a YouTube URL
    if (!streamUrl.includes('youtube.com') && !streamUrl.includes('youtu.be')) {
      setYoutubeMetadata(null);
      return;
    }
    
    const fetchMetadata = async () => {
      try {
        const response = await fetch('/api/youtube-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: streamUrl })
        });
        
        if (response.ok) {
          const metadata = await response.json();
          setYoutubeMetadata(metadata);
          setChannelName(metadata.channelName || '');
          
          // Auto-populate title if not already set
          if (!streamTitle && metadata.title) {
            setStreamTitle(metadata.title);
          }
        }
      } catch (error) {
        console.error('Error fetching YouTube metadata:', error);
      }
    };
    
    fetchMetadata();
  }, [streamUrl]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setStatus(`${label} copied to clipboard!`);
    setTimeout(() => setStatus(""), 2000);
  };

  const stopStream = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsStreaming(false);
    setStatus("Stream stopped");
  };

  const startStream = async () => {
    try {
      setStatus("Requesting screen capture...");
      setShowSuccess(false);
      
      // Get screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      streamRef.current = stream;
      
      // Generate stream ID
      const streamId = Math.random().toString(36).substring(2, 10);
      setStatus(`Connecting to streaming server...`);
      
      // Connect to WebSocket server
      const ws = new WebSocket('ws://localhost:8082');
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setStatus('Connected! Preparing stream...');
        
        // Send metadata after connection with delay
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const streamMetadata = {
              streamId: streamId,
              title: streamTitle || `Stream ${streamId}`,
              nsec: userNsec || '',
              thumbnail: youtubeMetadata?.thumbnail || '',
              channelName: channelName || '',
              summary: youtubeMetadata?.title ? `Streaming: ${youtubeMetadata.title}` : ''
            };
            console.log('Sending stream metadata:', streamMetadata);
            ws.send(JSON.stringify(streamMetadata));
          }
        }, 2000);
      };
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'nostr-info') {
            if (msg.npub) setNpub(msg.npub);
            if (msg.naddr) setNaddr(msg.naddr);
            if (msg.nsec && !userNsec) setGeneratedNsec(msg.nsec);
          }
          
          if (msg.status === 'ready') {
            setStatus(`Stream is Live!`);
            setIsStreaming(true);
            setShowSuccess(true);
            
            // Start sending video data
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
        setStatus('WebSocket connection error');
      };
      
      ws.onclose = () => {
        if (!event.wasClean) {
          setStatus('WebSocket closed unexpectedly');
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      };
      
      // Start MediaRecorder
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
      
      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped');
      };
      
      // Handle stream end
      stream.getVideoTracks()[0].onended = () => {
        stopStream();
      };
      
    } catch (error: any) {
      console.error('Error starting stream:', error);
      setStatus(`Error: ${error.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStreaming) {
      stopStream();
    } else {
      await startStream();
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-purple-50 to-orange-50 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-orange-600 bg-clip-text text-transparent">
            Nostr Stream Bridge
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Mirror YouTube/Twitch streams to Nostr with Lightning zaps ⚡
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Browser-based screen capture streaming
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                YouTube/Twitch URL to Mirror
              </label>
              <input
                type="url"
                required
                placeholder="https://youtube.com/watch?v=..."
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                disabled={isStreaming}
              />
            </div>

            {youtubeMetadata && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                <div className="flex items-start gap-4">
                  <img
                    src={youtubeMetadata.thumbnail}
                    alt="Video thumbnail"
                    className="w-32 h-20 object-cover rounded"
                    onError={(e) => {
                      e.currentTarget.src = youtubeMetadata.thumbnailFallback;
                    }}
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {youtubeMetadata.title}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {youtubeMetadata.channelName}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Stream Title (Optional - auto-filled from YouTube)
              </label>
              <input
                type="text"
                placeholder="My Awesome Stream"
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                disabled={isStreaming}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Persistent npub (Optional - paste nsec to reuse identity)
              </label>
              <input
                type="text"
                placeholder="nsec1... (leave empty to generate new)"
                value={userNsec}
                onChange={(e) => setUserNsec(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm"
                disabled={isStreaming}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Paste your nsec to maintain the same Nostr identity across streams
              </p>
            </div>
          </div>

          <button
            type="submit"
            className={`w-full px-6 py-3 rounded-lg font-semibold text-white transition-all ${
              isStreaming
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700"
            }`}
          >
            {isStreaming ? "Stop Stream" : "Start Screen Capture"}
          </button>
        </form>

        {status && (
          <div className={`p-4 rounded-lg text-center ${
            status.includes("Error") || status.includes("error")
              ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
          }`}>
            <p className="font-medium">{status}</p>
          </div>
        )}

        {showSuccess && npub && (
          <div className="p-6 border border-green-200 rounded-xl bg-green-50 dark:bg-green-900/20 space-y-4">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-semibold text-green-700 dark:text-green-400">
                Stream is Live on Nostr!
              </h2>
            </div>
            
            <div className="space-y-3 divide-y divide-gray-200 dark:divide-gray-700">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Nostr Public Key:</span>
                  <button
                    onClick={() => copyToClipboard(npub, "npub")}
                    className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    Copy
                  </button>
                </div>
                <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs break-all">
                  {npub}
                </code>
              </div>
              
              {generatedNsec && (
                <div className="space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      Private Key (Save for reuse):
                    </span>
                    <button
                      onClick={() => copyToClipboard(generatedNsec, "nsec")}
                      className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
                    >
                      Copy
                    </button>
                  </div>
                  <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs break-all text-red-600 dark:text-red-400">
                    {generatedNsec}
                  </code>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ⚠️ Save this key to reuse your Nostr identity for future streams
                  </p>
                </div>
              )}
              
              <div className="space-y-2 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    Lightning Address:
                  </span>
                  <button
                    onClick={() => copyToClipboard(`${npub}@npub.cash`, "Lightning address")}
                    className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    Copy
                  </button>
                </div>
                <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                  ⚡ {npub}@npub.cash
                </code>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <p className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-3">
                View Your Stream:
              </p>
              <div className="space-y-2">
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Find your stream on zap.stream:
                  </p>
                  <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                    <li>Go to <a href="https://zap.stream" target="_blank" rel="noreferrer" className="text-purple-600 hover:underline">zap.stream</a></li>
                    <li>Look for your stream title: "{streamTitle || 'Your Stream'}"</li>
                    <li>Or search for your npub: {npub.slice(0, 20)}...</li>
                  </ol>
                </div>
                
                <a 
                  href="https://nostrudel.ninja/#/streams"
                  target="_blank"
                  rel="noreferrer"
                  className="block text-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  View on Nostrudel
                </a>
                
                <a 
                  href="/nostr-viewer"
                  target="_blank"
                  rel="noreferrer"
                  className="block text-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Open Local Viewer
                </a>
              </div>
              
              <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800">
                <p className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2">
                  Next Steps:
                </p>
                <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside">
                  <li>Your stream is now live on Nostr</li>
                  <li>Viewers can send Lightning zaps to your address</li>
                  <li>Stream owner can claim zaps at <a href="https://npub.cash" target="_blank" rel="noreferrer" className="text-purple-600 hover:underline">npub.cash</a></li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}