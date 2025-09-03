# Kathreftestr 🎥⚡

Stream YouTube/Twitch content to Nostr with Bitcoin Lightning tips.

## Quick Start

### One-Click Install
```bash
curl -sSL https://raw.githubusercontent.com/islandbitcoin/kathreftestr/main/scripts/install.sh | bash
```

### Docker
```bash
docker compose up -d
```

Access at: `http://localhost:3000`

## Features

- 📺 Stream any YouTube/Twitch URL to Nostr
- ⚡ Bitcoin Lightning tips via npub.cash
- 🔒 Self-custody with nsec key management
- 🌐 Works on cloud platforms with proxy support
- 🚀 Auto-fallback when streaming is blocked

## Cloud Deployment

### Dealing with Streaming Blocks

Many cloud providers block YouTube/Twitch streaming. Use these environment variables:

```bash
# Enable proxy (for Render, DigitalOcean, etc.)
PROXY_ENABLED=true
PROXY_TYPE=tor  # or http, socks5
AUTO_FALLBACK=true  # Falls back to browser mode if needed
```

See [docs/PROXY-SETUP.md](docs/PROXY-SETUP.md) for detailed proxy configuration.

## Deploy Options

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/islandbitcoin/kathreftestr)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/islandbitcoin/kathreftestr)

[![Deploy to DigitalOcean](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/islandbitcoin/kathreftestr/tree/main)

## Documentation

- 📚 [Deployment Guide](docs/DEPLOY.md)
- 🔧 [Proxy Setup](docs/PROXY-SETUP.md)
- 🚀 [Installation Script](scripts/install.sh)

## Support

- [GitHub Issues](https://github.com/islandbitcoin/kathreftestr/issues)
- [Discussions](https://github.com/islandbitcoin/kathreftestr/discussions)

---

Built with ❤️ for the Nostr community