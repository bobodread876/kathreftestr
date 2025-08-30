# Nostr Stream Bridge

A self-hosted MVP that mirrors YouTube and Twitch streams to Nostr protocol, enabling Lightning Network payments (zaps) for content creators.

## Features

- Mirror live streams from YouTube/Twitch to Nostr
- Automatic Nostr keypair generation for each stream
- Lightning address integration via npub.cash
- NIP-53 compliant live events
- Compatible with Nostr streaming clients (zap.stream, etc.)
- Real-time Lightning zaps support
- Simple web interface for stream management

## Architecture

- **MediaMTX**: RTMP ingest and HLS output server
- **Streamlink/yt-dlp**: Stream pulling from YouTube/Twitch
- **Nostr Integration**: NIP-53 live events, NIP-57 zaps
- **Next.js**: Web interface and API
- **Lightning**: npub.cash integration for payments

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- ffmpeg installed locally
- streamlink or yt-dlp installed locally

### Installing Dependencies

**macOS:**
```bash
brew install ffmpeg streamlink yt-dlp
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
pip install streamlink yt-dlp
```

**Windows:**
- Install ffmpeg: https://ffmpeg.org/download.html
- Install streamlink: https://streamlink.github.io/install.html
- Install yt-dlp: https://github.com/yt-dlp/yt-dlp

## Quick Start

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/nostr-stream-bridge.git
cd nostr-stream-bridge
```

2. **Install dependencies:**
```bash
npm install
```

3. **Copy environment variables:**
```bash
cp .env.local.example .env.local
# Edit .env.local with your preferred settings
```

4. **Start MediaMTX (RTMP/HLS server):**
```bash
docker compose up -d
```

5. **Start the Next.js development server:**
```bash
npm run dev
```

6. **Open the web interface:**
```
http://localhost:3000
```

## Usage

1. **Start a Stream:**
   - Open http://localhost:3000
   - Paste a YouTube or Twitch livestream URL
   - Click "Start Mirror"
   - The system will:
     - Generate a new Nostr keypair (npub/nsec)
     - Create a Lightning address at `<npub>@npub.cash`
     - Publish a NIP-53 live event to Nostr relays
     - Start mirroring the stream

2. **View on Nostr:**
   - Open https://zap.stream or any NIP-53 compatible client
   - Search for your stream or browse live streams
   - Viewers can send Lightning zaps to the generated address

3. **Claim Funds:**
   - Stream owners can later claim their npub at npub.cash
   - All accumulated zaps will be available for withdrawal

## Configuration

### Environment Variables (.env.local)

```env
# MediaMTX Configuration
HLS_BASE=http://localhost:8888/live
RTMP_URL=rtmp://localhost:1935/live

# Nostr Relay Configuration
NOSTR_RELAYS=wss://relay.damus.io,wss://relay.snort.social,wss://relay.primal.net

# Default Thumbnail for Streams
DEFAULT_THUMB=https://placehold.co/1200x630?text=Nostr+Live

# Development Only - Return nsec in API responses
RETURN_NSEC=true

# Lightning Configuration
LIGHTNING_DOMAIN=npub.cash
```

### MediaMTX Configuration

Edit `mediamtx.yml` to customize:
- RTMP settings
- HLS parameters
- Authentication (add for production)
- Path configurations

## API Endpoints

### POST /api/start
Start mirroring a stream.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "ok": true,
  "stream": {
    "id": "abc123",
    "hls": "http://localhost:8888/live/abc123/index.m3u8",
    "rtmp": "rtmp://localhost:1935/live/abc123"
  },
  "nostr": {
    "npub": "npub1...",
    "nsec": "nsec1...",
    "liveEventId": "..."
  },
  "lightning": {
    "address": "npub1...@npub.cash"
  }
}
```

### POST /api/stop
Stop a running stream.

**Request:**
```json
{
  "id": "abc123",
  "nsec": "nsec1..." // Optional, to publish end event
}
```

## Development

### Project Structure
```
├── app/                  # Next.js app directory
│   ├── api/             # API routes
│   └── page.tsx         # Main UI
├── lib/                 # Core libraries
│   ├── keys.ts          # Nostr key management
│   ├── nostr.ts         # Nostr event publishing
│   └── mirror.ts        # Stream mirroring logic
├── docker-compose.yml   # MediaMTX container
├── mediamtx.yml        # MediaMTX configuration
└── package.json        # Dependencies
```

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
npm start
```

## Deployment

### Docker Deployment
```bash
docker compose -f docker-compose.prod.yml up -d
```

### VPS Deployment
1. Install Node.js, ffmpeg, streamlink
2. Configure nginx reverse proxy
3. Set up SSL certificates
4. Use PM2 for process management
5. Configure proper firewall rules

## Security Considerations

⚠️ **Development Configuration Only**

- Never expose `nsec` keys in production
- Implement proper authentication for API endpoints
- Use environment-specific relay configurations
- Set up rate limiting for API calls
- Configure MediaMTX authentication
- Use HTTPS in production
- Store keys securely (consider HSM or secure key storage)

## Legal Considerations

- Only mirror streams you own or have explicit permission to rebroadcast
- Respect platform Terms of Service
- Implement proper DMCA compliance procedures
- Consider content licensing implications

## Troubleshooting

### Stream Not Starting
- Check if MediaMTX is running: `docker ps`
- Verify ffmpeg is installed: `ffmpeg -version`
- Check streamlink installation: `streamlink --version`
- Review logs: `docker logs mediamtx`

### HLS Not Accessible
- Ensure port 8888 is not blocked
- Check MediaMTX configuration
- Verify CORS settings if accessing from different domain

### Nostr Events Not Publishing
- Verify relay connectivity
- Check relay URLs in .env.local
- Review browser console for errors

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Roadmap

- [ ] Implement claim flow for creators
- [ ] Add stream analytics dashboard
- [ ] Support for custom LNURL servers
- [ ] Zap splits for revenue sharing
- [ ] VOD recording and playback
- [ ] Multi-stream management
- [ ] Advanced scheduling features
- [ ] Mobile app development

## Links

- [Nostr Protocol](https://nostr.com)
- [NIP-53 Specification](https://github.com/nostr-protocol/nips/blob/master/53.md)
- [NIP-57 Lightning Zaps](https://github.com/nostr-protocol/nips/blob/master/57.md)
- [zap.stream](https://zap.stream)
- [npub.cash](https://npub.cash)
- [MediaMTX](https://github.com/bluenviron/mediamtx)

## License

MIT License - see LICENSE file for details
