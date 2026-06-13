# Kathreftestr 🪞⚡

> Mirror a livestream to Nostr. *Kathreftis* (καθρέφτης) — Greek for "mirror."

Point it at a YouTube or Twitch livestream; it re-streams the video as a
**[NIP-53](https://github.com/nostr-protocol/nips/blob/master/53.md) live event**
on Nostr, each with its own Lightning address for zaps. Self-hosted: your node,
your keys, your relays.

## How it works

```
yt-dlp → ffmpeg → MediaMTX (RTMP→HLS) → /live proxy (CORS) → kind:30311 live event
```

A fresh Nostr identity is generated per stream, its profile carries a
`<npub>@npub.cash` Lightning address (LUD-16), and the live event points at the
HLS URL your node serves. Any NIP-53 client (zap.stream, etc.) can find and play it.

## Self-host (one command)

Everything — the app, MediaMTX, ffmpeg, and yt-dlp — is in a single container.

```bash
docker compose up -d        # → http://localhost:3000
```

For anything beyond local use, set **`HLS_BASE`** to the URL viewers reach you at,
so the published event links a playable stream:

```bash
HLS_BASE=https://stream.example.com/live docker compose up -d
# or on a LAN:  HLS_BASE=http://192.168.1.50:3000/live
```

| env | default | purpose |
|---|---|---|
| `HLS_BASE` | `http://localhost:3000/live` | public URL the Nostr event links to |
| `NOSTR_RELAYS` | islandbitcoin, damus, nos.lol, primal | comma-separated relays to publish to |
| `PORT` | `3000` | app port |

## Develop locally

Requires **Node 20+**, **ffmpeg**, **yt-dlp**, and **MediaMTX** on your PATH:

```bash
brew install ffmpeg yt-dlp mediamtx     # macOS
npm install
npm run stream:mediamtx &               # MediaMTX (RTMP :1935, HLS :8888)
npm run dev                             # → http://localhost:3000
```

`npm run build` type-checks and builds; the dev server (`server.js`) also
supervises MediaMTX in production.

## Scope

This is the lean server path (`yt-dlp → ffmpeg → MediaMTX`), the right shape for
self-hosting from home. An earlier headless-Chrome browser-capture path (built to
work around cloud-provider IP blocks) was removed — home nodes don't hit those
blocks, and dropping puppeteer keeps the image small.

Only mirror content you have the right to redistribute.

## License

MIT
