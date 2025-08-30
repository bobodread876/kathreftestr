"use client";

import { useState } from "react";

interface StreamResult {
  ok: boolean;
  stream: {
    source: string;
    id: string;
    hls: string;
  };
  nostr: {
    npub: string;
    nsec?: string;
    liveEventId: string;
  };
  lightning: {
    address: string;
  };
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StreamResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start stream");
      setResult(data);
      setUrl(""); // Clear input on success
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  }

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
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex gap-3">
            <input
              type="url"
              required
              placeholder="Paste YouTube or Twitch livestream URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-orange-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-700 hover:to-orange-700 transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Starting…
                </span>
              ) : (
                "Start Mirror"
              )}
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Make sure the stream is live and publicly accessible
          </p>
        </form>

        {error && (
          <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
            <p className="font-semibold">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {result?.ok && (
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
                    onClick={() => copyToClipboard(result.nostr.npub, "npub")}
                    className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    Copy
                  </button>
                </div>
                <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs break-all">
                  {result.nostr.npub}
                </code>
              </div>
              
              {result.nostr.nsec && (
                <div className="space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      Private Key (Dev Only):
                    </span>
                    <button
                      onClick={() => copyToClipboard(result.nostr.nsec, "nsec")}
                      className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
                    >
                      Copy
                    </button>
                  </div>
                  <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs break-all text-red-600 dark:text-red-400">
                    {result.nostr.nsec}
                  </code>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ⚠️ Never share this key in production
                  </p>
                </div>
              )}
              
              <div className="space-y-2 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    Lightning Address:
                  </span>
                  <button
                    onClick={() => copyToClipboard(result.lightning.address, "Lightning address")}
                    className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    Copy
                  </button>
                </div>
                <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                  ⚡ {result.lightning.address}
                </code>
              </div>
              
              <div className="space-y-2 pt-3">
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  HLS Stream URL:
                </span>
                <a
                  href={result.stream.hls}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
                >
                  {result.stream.hls}
                </a>
              </div>
              
              <div className="space-y-2 pt-3">
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  Live Event ID:
                </span>
                <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
                  {result.nostr.liveEventId}
                </code>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <p className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2">
                Next Steps:
              </p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside">
                <li>Open <a href="https://zap.stream" target="_blank" rel="noreferrer" className="text-purple-600 hover:underline">zap.stream</a> or another Nostr live client</li>
                <li>Search for your stream or browse live streams</li>
                <li>Viewers can send Lightning zaps to the address above</li>
                <li>Stream owner can claim the npub and accumulated zaps later</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}