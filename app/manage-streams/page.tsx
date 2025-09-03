"use client";

import { useState, useEffect } from "react";

interface ActiveStream {
  streamId: string;
  title?: string;
  startedAt: string;
  npub: string;
}

export default function ManageStreams() {
  const [activeStreams, setActiveStreams] = useState<ActiveStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [stoppingStream, setStoppingStream] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveStreams();
    // Refresh every 10 seconds
    const interval = setInterval(fetchActiveStreams, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchActiveStreams = async () => {
    try {
      // Try server streams first
      const serverResponse = await fetch('/api/server-stream');
      if (serverResponse.ok) {
        const serverData = await serverResponse.json();
        if (serverData.activeStreams && serverData.activeStreams.length > 0) {
          setActiveStreams(serverData.activeStreams);
          return;
        }
      }
      
      // Also check headless streams
      const headlessResponse = await fetch('/api/headless-stream');
      if (headlessResponse.ok) {
        const headlessData = await headlessResponse.json();
        setActiveStreams(headlessData.activeStreams || []);
      }
    } catch (error) {
      console.error('Error fetching active streams:', error);
    }
  };

  const stopStream = async (streamId: string, streamNpub: string) => {
    const nsec = prompt('Enter your nsec to stop this stream:');
    if (!nsec) {
      setStatus("Authentication required to stop stream");
      return;
    }

    setStoppingStream(streamId);
    setStatus("");

    try {
      // Try server stream first
      let response = await fetch('/api/server-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stop',
          streamId: streamId,
          nsec: nsec
        })
      });

      // If server stream doesn't have it, try headless
      if (!response.ok || response.status === 404) {
        response = await fetch('/api/headless-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'stop',
            url: streamId,
            nsec: nsec
          })
        });
      }

      const data = await response.json();

      if (response.ok) {
        setStatus(`Stream ${streamId} stopped successfully`);
        fetchActiveStreams(); // Refresh the list
      } else {
        setStatus(data.error || `Failed to stop stream ${streamId}`);
        
        if (response.status === 403) {
          // Authentication failed
          const retry = confirm('Authentication failed. Would you like to try again with a different nsec?');
          if (retry) {
            stopStream(streamId, streamNpub);
          }
        }
      }
    } catch (error) {
      console.error('Error stopping stream:', error);
      setStatus(`Error stopping stream ${streamId}`);
    } finally {
      setStoppingStream(null);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return date.toLocaleString();
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setStatus(`${label} copied to clipboard`);
    setTimeout(() => setStatus(""), 2000);
  };

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-purple-50 to-orange-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1 flex justify-start">
              <a
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Stream
              </a>
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-orange-600 bg-clip-text text-transparent">
                Manage Active Streams
              </h1>
            </div>
            <div className="flex-1"></div>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            View and control your active streams
          </p>
        </div>

        {status && (
          <div className={`p-4 rounded-lg text-center ${
            status.includes("Error") || status.includes("failed")
              ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
          }`}>
            <p className="font-medium">{status}</p>
          </div>
        )}

        {activeStreams.length === 0 ? (
          <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-xl">
            <p className="text-gray-500 dark:text-gray-400">
              No active streams
            </p>
            <a
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Start a Stream
            </a>
          </div>
        ) : (
          <div className="grid gap-6">
            {activeStreams.map((stream) => (
              <div
                key={stream.streamId}
                className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {stream.title || `Stream ${stream.streamId}`}
                      </h3>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400">Stream ID:</span>
                        <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                          {stream.streamId}
                        </code>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400">Started:</span>
                        <span>{formatTime(stream.startedAt)}</span>
                      </div>
                      
                      {stream.npub && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 dark:text-gray-400">npub:</span>
                          <code 
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                            onClick={() => copyToClipboard(stream.npub, "npub")}
                          >
                            {stream.npub.slice(0, 20)}...{stream.npub.slice(-10)}
                          </code>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400">HLS URL:</span>
                        <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                          http://localhost:8890/live/{stream.streamId}/index.m3u8
                        </code>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => stopStream(stream.streamId, stream.npub || '')}
                    disabled={stoppingStream === stream.streamId}
                    className={`px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                      stoppingStream === stream.streamId
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    {stoppingStream === stream.streamId ? "Stopping..." : "Stop Stream"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Only stream owners can stop their streams using their nsec
          </p>
        </div>
      </div>
    </main>
  );
}