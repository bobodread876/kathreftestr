"use client";

import { useState, useRef, useEffect } from "react";

type StreamMethod = "browser" | "headless" | "server" | null;

export default function StreamChoice() {
  const [streamUrl, setStreamUrl] = useState("");
  const [streamTitle, setStreamTitle] = useState("");
  const [userNsec, setUserNsec] = useState("");
  const [channelName, setChannelName] = useState("");
  const [status, setStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [npub, setNpub] = useState("");
  const [generatedNsec, setGeneratedNsec] = useState("");
  const [youtubeMetadata, setYoutubeMetadata] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [streamMethod, setStreamMethod] = useState<StreamMethod>(null);
  const [headlessStreamId, setHeadlessStreamId] = useState("");
  const [serverStreamId, setServerStreamId] = useState("");
  const [serverAnalysis, setServerAnalysis] = useState<any>(null);
  const [savedCredentials, setSavedCredentials] = useState<any[]>([]);
  const [showSavedCredentials, setShowSavedCredentials] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load saved credentials on mount
  useEffect(() => {
    const saved = localStorage.getItem('nostr-stream-credentials');
    if (saved) {
      try {
        const credentials = JSON.parse(saved);
        setSavedCredentials(credentials);
      } catch (error) {
        console.error('Error loading saved credentials:', error);
      }
    }
  }, []);

  // Auto-save and download credentials when nsec is generated
  useEffect(() => {
    if (generatedNsec && npub && isStreaming) {
      const credential = {
        npub,
        nsec: generatedNsec,
        streamTitle: streamTitle || 'Untitled Stream',
        streamUrl,
        timestamp: new Date().toISOString(),
        streamId: headlessStreamId || serverStreamId || 'browser-stream'
      };

      // Save to localStorage
      const existing = JSON.parse(localStorage.getItem('nostr-stream-credentials') || '[]');
      const updated = [credential, ...existing].slice(0, 10); // Keep last 10
      localStorage.setItem('nostr-stream-credentials', JSON.stringify(updated));
      setSavedCredentials(updated);

      // Auto-download credentials
      downloadCredentials(credential);
      
      // Show warning modal
      if (!userNsec) {
        setTimeout(() => {
          alert('⚠️ IMPORTANT: Your stream credentials have been downloaded.\n\n' + 
                'Save the file "stream-credentials-[date].txt" to stop or manage your stream later.\n\n' +
                'Your nsec has also been saved in this browser for convenience.');
        }, 1000);
      }
    }
  }, [generatedNsec, npub, isStreaming, streamTitle, streamUrl, headlessStreamId, serverStreamId, userNsec]);

  const downloadCredentials = (credential: any) => {
    const content = `
=================================
NOSTR STREAM CREDENTIALS
=================================
Generated: ${new Date().toLocaleString()}
Stream Title: ${credential.streamTitle}
Original URL: ${credential.streamUrl}
Stream ID: ${credential.streamId}

IMPORTANT - SAVE THESE CREDENTIALS:
====================================
Public Key (npub): ${credential.npub}
Private Key (nsec): ${credential.nsec}

Lightning Address: ${credential.npub}@npub.cash

⚠️ WARNING: Save this nsec to stop or republish your stream!
Never share your nsec with anyone.

To stop your stream:
1. Go to the Manage Streams page
2. Enter this nsec when prompted

To republish to the same identity:
Use this nsec in the "Persistent npub" field
=================================
`;

    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stream-credentials-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fetch YouTube metadata when URL changes
  useEffect(() => {
    if (!streamUrl) {
      setYoutubeMetadata(null);
      return;
    }
    
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

  const useSavedCredential = (credential: any) => {
    setUserNsec(credential.nsec);
    setShowSavedCredentials(false);
    setStatus("Loaded saved credentials");
  };

  const clearSavedCredentials = () => {
    if (confirm('Are you sure you want to clear all saved credentials?')) {
      localStorage.removeItem('nostr-stream-credentials');
      setSavedCredentials([]);
      setShowSavedCredentials(false);
      setStatus("Cleared saved credentials");
    }
  };

  const stopBrowserStream = () => {
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
    setStreamMethod(null);
  };

  const stopHeadlessStream = async () => {
    if (!headlessStreamId) return;
    
    // Ask for nsec if not provided
    let nsecToUse = userNsec || generatedNsec;
    
    if (!nsecToUse) {
      nsecToUse = prompt('Enter your nsec to stop the stream:');
      if (!nsecToUse) {
        setStatus("Authentication required to stop stream");
        return;
      }
    }
    
    try {
      const response = await fetch('/api/headless-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'stop',
          url: headlessStreamId, // Pass streamId as url for stop action
          nsec: nsecToUse
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setStatus("Headless stream stopped successfully");
        setIsStreaming(false);
        setHeadlessStreamId("");
        setStreamMethod(null);
      } else {
        setStatus(data.error || "Failed to stop headless stream");
        if (response.status === 403) {
          // Authentication failed, ask for correct nsec
          const correctNsec = prompt('Authentication failed. Please enter the correct nsec for this stream:');
          if (correctNsec) {
            // Retry with new nsec
            const retryResponse = await fetch('/api/headless-stream', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: 'stop',
                url: headlessStreamId,
                nsec: correctNsec
              })
            });
            
            if (retryResponse.ok) {
              setStatus("Headless stream stopped successfully");
              setIsStreaming(false);
              setHeadlessStreamId("");
              setStreamMethod(null);
            } else {
              const retryData = await retryResponse.json();
              setStatus(retryData.error || "Failed to stop stream");
            }
          }
        }
      }
    } catch (error) {
      console.error('Error stopping headless stream:', error);
      setStatus("Error stopping headless stream");
    }
  };

  const startBrowserStream = async () => {
    try {
      setStatus("Requesting screen capture...");
      setShowSuccess(false);
      setStreamMethod("browser");
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      streamRef.current = stream;
      
      const streamId = Math.random().toString(36).substring(2, 10);
      setStatus(`Connecting to streaming server...`);
      
      const ws = new WebSocket('ws://localhost:8082');
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setStatus('Connected! Preparing stream...');
        
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
            if (msg.nsec && !userNsec) setGeneratedNsec(msg.nsec);
          }
          
          if (msg.status === 'ready') {
            setStatus(`Stream is Live!`);
            setIsStreaming(true);
            setShowSuccess(true);
            
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
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      };
      
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
      
      stream.getVideoTracks()[0].onended = () => {
        stopBrowserStream();
      };
      
    } catch (error: any) {
      console.error('Error starting browser stream:', error);
      setStatus(`Error: ${error.message}`);
      setStreamMethod(null);
    }
  };

  const startHeadlessStream = async () => {
    try {
      setStatus("Starting headless browser stream...");
      setShowSuccess(false);
      setStreamMethod("headless");
      
      const response = await fetch('/api/headless-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: streamUrl,
          title: streamTitle || undefined,
          nsec: userNsec || undefined
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start headless stream');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setHeadlessStreamId(data.streamId);
        setNpub(data.npub || '');
        if (data.nsec && !userNsec) {
          setGeneratedNsec(data.nsec);
        }
        if (data.title && !streamTitle) {
          setStreamTitle(data.title);
        }
        if (data.channelName) {
          setChannelName(data.channelName);
        }
        
        setStatus("Headless stream is Live!");
        setIsStreaming(true);
        setShowSuccess(true);
      } else {
        throw new Error('Failed to start stream');
      }
      
    } catch (error: any) {
      console.error('Error starting headless stream:', error);
      setStatus(`Error: ${error.message}`);
      setStreamMethod(null);
    }
  };

  const stopServerStream = async () => {
    if (!serverStreamId) return;
    
    // Ask for nsec if not provided
    let nsecToUse = userNsec || generatedNsec;
    
    if (!nsecToUse) {
      nsecToUse = prompt('Enter your nsec to stop the stream:');
      if (!nsecToUse) {
        setStatus("Authentication required to stop stream");
        return;
      }
    }
    
    try {
      const response = await fetch('/api/server-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'stop',
          streamId: serverStreamId,
          nsec: nsecToUse
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setStatus("Server stream stopped successfully");
        setIsStreaming(false);
        setServerStreamId("");
        setStreamMethod(null);
      } else {
        setStatus(data.error || "Failed to stop server stream");
        if (response.status === 403) {
          // Authentication failed
          const retry = confirm('Authentication failed. Would you like to try again?');
          if (retry) {
            stopServerStream();
          }
        }
      }
    } catch (error) {
      console.error('Error stopping server stream:', error);
      setStatus("Error stopping server stream");
    }
  };

  const startServerStream = async () => {
    try {
      setStatus("Starting efficient server stream...");
      setShowSuccess(false);
      setStreamMethod("server");
      
      // First analyze the URL
      const analyzeResponse = await fetch('/api/server-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          url: streamUrl
        })
      });
      
      const analysis = await analyzeResponse.json();
      setServerAnalysis(analysis);
      
      if (!analysis.serverSupported) {
        setStatus(`Server streaming not supported: ${analysis.reasons.join(', ')}`);
        setStreamMethod(null);
        return;
      }
      
      // Start the stream
      const response = await fetch('/api/server-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          url: streamUrl,
          title: streamTitle || analysis.metadata?.title,
          nsec: userNsec || undefined,
          publishToNostr: true
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start server stream');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setServerStreamId(data.streamId);
        setNpub(data.npub || '');
        if (data.generatedNsec && !userNsec) {
          setGeneratedNsec(data.generatedNsec);
        }
        
        setStatus("Efficient server stream is Live!");
        setIsStreaming(true);
        setShowSuccess(true);
      } else {
        throw new Error(data.error || 'Failed to start stream');
      }
      
    } catch (error: any) {
      console.error('Error starting server stream:', error);
      setStatus(`Error: ${error.message}`);
      setStreamMethod(null);
    }
  };

  const handleStop = () => {
    if (streamMethod === "browser") {
      stopBrowserStream();
    } else if (streamMethod === "headless") {
      stopHeadlessStream();
    } else if (streamMethod === "server") {
      stopServerStream();
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-purple-50 to-orange-50 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1"></div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-orange-600 bg-clip-text text-transparent">
                Nostr Stream Bridge
              </h1>
            </div>
            <div className="flex-1 flex justify-end">
              <a
                href="/manage-streams"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage Streams
              </a>
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Choose your streaming method: Browser, Efficient Server, or Headless
          </p>
        </div>

        {!isStreaming && (
          <div className="space-y-6">
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
                  Stream Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="My Awesome Stream"
                  value={streamTitle}
                  onChange={(e) => setStreamTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Persistent npub (Optional)
                  </label>
                  {savedCredentials.length > 0 && (
                    <button
                      onClick={() => setShowSavedCredentials(!showSavedCredentials)}
                      className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      {showSavedCredentials ? 'Hide' : 'Show'} Saved ({savedCredentials.length})
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="nsec1... (leave empty to generate new)"
                  value={userNsec}
                  onChange={(e) => setUserNsec(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm"
                />
              </div>

              {showSavedCredentials && savedCredentials.length > 0 && (
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300">Saved Credentials</h4>
                    <button
                      onClick={clearSavedCredentials}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {savedCredentials.map((cred, index) => (
                      <div 
                        key={index} 
                        className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {cred.streamTitle}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(cred.timestamp).toLocaleString()}
                            </p>
                            <p className="text-xs font-mono text-gray-600 dark:text-gray-500">
                              {cred.npub.slice(0, 20)}...
                            </p>
                          </div>
                          <button
                            onClick={() => useSavedCredential(cred)}
                            className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                          >
                            Use
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-purple-400 transition-colors">
                <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
                  🖥️ Browser Streaming
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Use your browser's screen capture to stream. You control what's shared.
                </p>
                <ul className="text-xs text-gray-500 dark:text-gray-500 space-y-1 mb-4">
                  <li>✓ Full control over what's captured</li>
                  <li>✓ Works with any website</li>
                  <li>✓ Requires manual screen selection</li>
                </ul>
                <button
                  onClick={startBrowserStream}
                  disabled={!streamUrl}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Start Browser Stream
                </button>
              </div>

              <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-green-400 transition-colors">
                <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
                  ⚡ Efficient Server
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Direct stream extraction. Most efficient method.
                </p>
                <ul className="text-xs text-gray-500 dark:text-gray-500 space-y-1 mb-4">
                  <li>✓ Direct stream extraction</li>
                  <li>✓ No browser overhead</li>
                  <li>✓ Best performance</li>
                </ul>
                <button
                  onClick={startServerStream}
                  disabled={!streamUrl}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Start Server Stream
                </button>
              </div>

              <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-orange-400 transition-colors">
                <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
                  🤖 Headless Browser
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Automated browser streaming (fallback).
                </p>
                <ul className="text-xs text-gray-500 dark:text-gray-500 space-y-1 mb-4">
                  <li>✓ Works with any site</li>
                  <li>✓ No screen capture needed</li>
                  <li>✓ Higher resource usage</li>
                </ul>
                <button
                  onClick={startHeadlessStream}
                  disabled={!streamUrl}
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Start Headless Stream
                </button>
              </div>
            </div>
          </div>
        )}

        {isStreaming && (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-medium">
                {streamMethod === "browser" ? "Browser Stream Active" : 
                 streamMethod === "server" ? "Efficient Server Stream Active" : 
                 "Headless Browser Stream Active"}
              </span>
            </div>
            <button
              onClick={handleStop}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Stop Stream
            </button>
          </div>
        )}

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
            
            <div className="space-y-3">
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
                </div>
              )}
              
              <div className="space-y-2 pt-3">
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  Lightning Address:
                </span>
                <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                  ⚡ {npub}@npub.cash
                </code>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Find your stream on <a href="https://zap.stream" target="_blank" rel="noreferrer" className="text-purple-600 hover:underline">zap.stream</a> by searching for "{streamTitle || 'Your Stream'}"
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}