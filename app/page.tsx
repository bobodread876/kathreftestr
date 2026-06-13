"use client";

import { useState } from "react";

interface StartResult {
  ok: boolean;
  stream: { source: string; id: string; hls: string; rtmp: string };
  nostr: { npub: string; nsec?: string; liveEventId: string; profileEventId: string; publishedToRelays: string[] };
  lightning: { address: string };
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<StartResult | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to start the mirror.");
      setStream(data);
    } catch (e: any) {
      setError(e?.message || "Failed to start the mirror.");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!stream) return;
    setBusy(true);
    try {
      await fetch("/api/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: stream.stream.id, nsec: stream.nostr.nsec }),
      });
    } catch {
      /* best effort */
    } finally {
      setStream(null);
      setUrl("");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex flex-col items-center px-5 py-12">
      <div className="w-full max-w-xl">
        <header className="flex items-center gap-3 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kathreftstr-logo.svg" alt="" width={34} height={34} />
          <h1 className="text-2xl font-semibold tracking-tight">Kathreftestr</h1>
        </header>
        <p className="text-zinc-400 text-sm mb-8">
          Mirror a live stream to Nostr. Paste a YouTube or Twitch URL — it&apos;s re-streamed as a
          NIP-53 live event with its own Lightning address for zaps. Self-hosted; your node, your keys.
        </p>

        {!stream ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">Stream URL</label>
            <input
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono
                         focus:outline-none focus:border-orange-500/60 transition-colors"
              placeholder="https://www.youtube.com/watch?v=…  or  https://twitch.tv/…"
              value={url}
              disabled={busy}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && start()}
            />
            <button
              className="mt-4 w-full rounded-xl bg-orange-500 text-black font-semibold py-3
                         hover:brightness-110 active:scale-[.99] transition disabled:opacity-50"
              onClick={start}
              disabled={busy || !url.trim()}
            >
              {busy ? "Starting the mirror…" : "Mirror to Nostr"}
            </button>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <p className="mt-4 text-xs text-zinc-600">
              A fresh Nostr identity is generated per stream. Mirror only content you have the right to.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-green-900/50 bg-zinc-950 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-400 font-semibold">Live on Nostr</span>
              <span className="text-zinc-500 text-xs ml-auto">
                {stream.nostr.publishedToRelays.length} relay
                {stream.nostr.publishedToRelays.length === 1 ? "" : "s"}
              </span>
            </div>
            <Field label="Source" value={stream.stream.source} />
            <Field label="Nostr identity" value={stream.nostr.npub} mono />
            <Field label="Lightning (zaps)" value={stream.lightning.address} mono />
            <Field label="HLS" value={stream.stream.hls} mono />
            <p className="mt-4 text-xs text-zinc-500">
              Find it in any NIP-53 client (zap.stream, etc.) by the npub above.
            </p>
            <button
              className="mt-4 w-full rounded-xl border border-zinc-700 text-zinc-200 font-semibold py-3
                         hover:bg-zinc-900 active:scale-[.99] transition disabled:opacity-50"
              onClick={stop}
              disabled={busy}
            >
              {busy ? "Stopping…" : "Stop mirror"}
            </button>
          </div>
        )}

        <footer className="mt-10 text-center text-xs text-zinc-600">
          Kathreftestr · YouTube/Twitch → Nostr (NIP-53) · self-hosted ·{" "}
          <a className="text-zinc-500 hover:text-zinc-300" href="https://github.com/bobodread876/kathreftestr">
            source
          </a>
        </footer>
      </div>
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-2 border-b border-zinc-900 last:border-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className={`text-sm break-all ${mono ? "font-mono text-zinc-300" : "text-zinc-200"}`}>{value}</div>
    </div>
  );
}
