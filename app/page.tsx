"use client";

import { useState } from "react";

interface StartResult {
  ok: boolean;
  stream: { source: string; title?: string | null; uploader?: string | null; id: string; hls: string; rtmp: string };
  nostr: { npub: string; nsec?: string; naddr: string; liveEventId: string; profileEventId: string; publishedToRelays: string[] };
  watch: { zapStream: string; njump: string };
  lightning: { address: string; claimWith: string };
  warning?: string;
}

function Secret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <code className="text-xs text-amber-200/90 break-all font-mono flex-1">
        {shown ? value : "nsec1" + "•".repeat(54)}
      </code>
      <button
        onClick={() => setShown((s) => !s)}
        className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 shrink-0"
        aria-label={shown ? "Hide secret key" : "Reveal secret key"}
      >
        {shown ? "🙈 hide" : "👁 reveal"}
      </button>
      <Copy text={value} />
    </div>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="ml-2 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 shrink-0"
    >
      {done ? "copied" : "copy"}
    </button>
  );
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
            {stream.stream.title && (
              <div className="mb-4">
                <div className="text-lg font-semibold leading-snug">{stream.stream.title}</div>
                {stream.stream.uploader && (
                  <div className="text-sm text-zinc-400">by {stream.stream.uploader}</div>
                )}
              </div>
            )}
            {stream.warning && (
              <p className="mb-4 text-xs text-amber-300/90 bg-amber-950/30 border border-amber-900/50 rounded-lg p-3">
                ⚠ {stream.warning}
              </p>
            )}
            <a
              href={stream.watch.zapStream}
              target="_blank"
              rel="noreferrer"
              className="mb-4 block w-full text-center rounded-xl bg-violet-600 text-white font-semibold py-3
                         hover:brightness-110 active:scale-[.99] transition"
            >
              ▶ Watch on zap.stream
            </a>
            <Field label="Source" value={stream.stream.source} />
            <Field label="Nostr identity (npub)" value={stream.nostr.npub} mono copy />
            <Field label="Lightning (zaps)" value={stream.lightning.address} mono copy />
            <Field label="HLS" value={stream.stream.hls} mono />
            <p className="mt-3 text-xs text-zinc-500">
              Also at <a className="text-violet-400 hover:underline" href={stream.watch.njump} target="_blank" rel="noreferrer">njump.me</a>,
              or find it by npub in any NIP-53 client (Amethyst, etc.).
            </p>

            {stream.nostr.nsec && (
              <div className="mt-5 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4">
                <div className="text-[10px] uppercase tracking-wider text-amber-500/80 mb-1">
                  🔑 Secret key (nsec) — save this
                </div>
                <Secret value={stream.nostr.nsec} />
                <p className="mt-2 text-xs text-zinc-400">
                  This controls the stream&apos;s identity and is the <b>only</b> way to claim its zaps.
                  A fresh key is generated per stream and isn&apos;t stored — copy it now or the funds are unrecoverable.
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  <b>Claim zaps:</b> sign in to{" "}
                  <a className="text-violet-400 hover:underline" href={stream.lightning.claimWith} target="_blank" rel="noreferrer">
                    npub.cash
                  </a>{" "}
                  with this nsec and withdraw the sats sent to the Lightning address above.
                </p>
              </div>
            )}
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

function Field({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  return (
    <div className="py-2 border-b border-zinc-900 last:border-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className="flex items-start">
        <div className={`text-sm break-all ${mono ? "font-mono text-zinc-300" : "text-zinc-200"}`}>{value}</div>
        {copy && <Copy text={value} />}
      </div>
    </div>
  );
}
