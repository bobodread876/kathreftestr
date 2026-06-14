// Kathreftestr server: Next.js app + MediaMTX (RTMP ingest → HLS).
// The mirror pipeline (yt-dlp → ffmpeg → MediaMTX) is driven by /api/start;
// this wrapper just serves the app and keeps MediaMTX running alongside it.

const { spawn } = require('child_process');
const { existsSync } = require('fs');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

let mediamtxProcess = null;

// Start MediaMTX in production (the Docker image bundles it). In dev, run it
// yourself: `mediamtx mediamtx.yml` (or `npm run stream:start` via compose).
async function startMediaMTX() {
  if (process.env.NODE_ENV !== 'production') return;
  const mediamtxPath = process.env.MEDIAMTX_BIN || '/usr/local/bin/mediamtx';
  const configPath = process.env.MEDIAMTX_CONFIG || '/etc/mediamtx.yml';

  if (!existsSync(mediamtxPath)) {
    console.log('MediaMTX binary not found at', mediamtxPath, '— skipping (set MEDIAMTX_BIN).');
    return;
  }

  console.log('Starting MediaMTX...');
  mediamtxProcess = spawn(mediamtxPath, [configPath], { stdio: 'inherit', detached: false });
  mediamtxProcess.on('error', (err) => {
    console.error('Failed to start MediaMTX:', err);
    mediamtxProcess = null;
  });
  mediamtxProcess.on('exit', (code) => {
    if (code !== 0) console.error(`MediaMTX exited with code ${code} (port conflict?). Continuing.`);
    mediamtxProcess = null;
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res, parse(req.url, true)));
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, async (err) => {
    if (err) throw err;
    await startMediaMTX();
    printBanner(PORT);
  });
});

function printBanner(port) {
  const hlsBase = process.env.HLS_BASE || `http://localhost:${port}/live`;
  const relays = process.env.NOSTR_RELAYS || 'defaults (islandbitcoin, damus, nos.lol, primal)';
  const line = '─'.repeat(58);
  const localHls = /localhost|127\.|192\.168\.|10\.|\.local/.test(hlsBase);
  console.log(`
${line}
  🪞  Kathreftestr is live

  Open:        http://localhost:${port}
  Paste a YouTube/Twitch URL and click "Mirror to Nostr".

  HLS_BASE:    ${hlsBase}${localHls ? '   ⚠ local-only' : ''}
               ↳ the URL your published stream links to.
  NOSTR_RELAYS: ${relays}
               ↳ comma-separated relays to publish the live event to.

  Public playback (so zap.stream etc. can PLAY it, not just see the event):
  expose this node over HTTPS and point HLS_BASE at its /live path.
    • cloudflared (free, works):
        cloudflared tunnel --url http://localhost:${port}
        then start with  HLS_BASE=https://<id>.trycloudflare.com/live
    • ngrok: only on a PAID plan — the free tier's browser-warning page
      blocks HLS players. Paid:  HLS_BASE=https://<you>.ngrok.app/live
${line}
`);
}

function cleanup() {
  if (mediamtxProcess) {
    console.log('Stopping MediaMTX...');
    mediamtxProcess.kill();
  }
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
