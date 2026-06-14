import { NextRequest, NextResponse } from "next/server";
import { generateKeypair } from "@/lib/keys";
import { fetchStreamMeta } from "@/lib/meta";
import { startMirror } from "@/lib/mirror";
import { publishEvent, profileKind0Template, liveEventTemplate } from "@/lib/nostr";
import * as nip19 from "nostr-tools/nip19";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json() as { url?: string };
    
    // Validate URL
    if (!url || !/^https?:\/\/.+/.test(url)) {
      return NextResponse.json(
        { error: "Valid YouTube/Twitch URL required." },
        { status: 400 }
      );
    }

    // Check if it's a supported platform
    const urlObj = new URL(url);
    const isYouTube = urlObj.hostname.includes("youtube.com") || urlObj.hostname.includes("youtu.be");
    const isTwitch = urlObj.hostname.includes("twitch.tv");
    
    if (!isYouTube && !isTwitch) {
      return NextResponse.json(
        { error: "Only YouTube and Twitch streams are supported." },
        { status: 400 }
      );
    }

    // 0) Pull source metadata for attribution (title, channel, thumbnail).
    const meta = await fetchStreamMeta(url);

    // 1) Start mirroring the stream to MediaMTX
    console.log(`Starting mirror for: ${url}`);
    const { id, hlsUrl, rtmpUrl } = startMirror({ sourceUrl: url });
    console.log(`Stream started with ID: ${id}`);
    console.log(`HLS URL: ${hlsUrl}`);
    console.log(`RTMP URL: ${rtmpUrl}`);

    // 2) Generate a fresh nostr keypair for THIS stream
    const { skHex, pkHex, nsec, npub } = generateKeypair();
    console.log(`Generated keypair - npub: ${npub}`);

    // 3) Set Lightning Address to <npub>@npub.cash
    const lightningDomain = process.env.LIGHTNING_DOMAIN || "npub.cash";
    const lightningAddress = `${npub}@${lightningDomain}`;
    console.log(`Lightning address: ${lightningAddress}`);

    // 4) Publish profile metadata (kind:0) with LUD-16 — named after the real
    // source account so the mirror is properly attributed and zap-discoverable.
    const profileEvt = profileKind0Template({
      pkHex,
      name: meta.uploader || `Stream ${id}`,
      lud16: lightningAddress,
      about: meta.uploader
        ? `Mirror of ${meta.uploader}'s stream (originally on ${urlObj.hostname}), re-broadcast to Nostr by Kathreftestr.`
        : `Mirrored stream from ${urlObj.hostname}`,
      picture: meta.thumbnail || process.env.DEFAULT_THUMB,
      website: meta.uploaderUrl || url,
    });
    
    console.log("Publishing profile event...");
    const profileResult = await publishEvent(skHex, profileEvt);
    console.log(`Profile published with ID: ${profileResult.id}`);

    // 5) Publish NIP-53 Live Event
    // Clients like zap.stream will pick this up and show your player + zap button
    const liveEvt = liveEventTemplate({
      pkHex,
      dTag: id,
      streamingUrl: hlsUrl,
      title: meta.title || `Live from ${urlObj.hostname}`,
      summary: meta.uploader ? `Mirror of ${meta.uploader} — ${url}` : `Mirrored from ${url}`,
      image: meta.thumbnail || process.env.DEFAULT_THUMB,
      zapPubkeyHex: pkHex, // direct zaps to this pubkey
    });
    
    console.log("Publishing live event...");
    const { id: liveEventId, relays } = await publishEvent(skHex, liveEvt);
    console.log(`Live event published with ID: ${liveEventId}`);
    console.log(`Published to relays: ${relays.join(", ")}`);

    // Wait a bit for HLS to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Addressable coordinate (NIP-19) for the kind:30311 live event — this is
    // what NIP-53 viewers (zap.stream) and njump resolve.
    const naddr = nip19.naddrEncode({ identifier: id, pubkey: pkHex, kind: 30311, relays });

    // Self-host default: return the nsec to the local operator. It's the ONLY
    // way to control this stream's identity and CLAIM zaps sent to its Lightning
    // address (sign in to npub.cash with it). Set RETURN_NSEC=false on a
    // public-facing deployment where the browser isn't the trusted operator.
    const returnNsec = process.env.RETURN_NSEC !== "false";

    // Remote NIP-53 viewers (zap.stream) can only PLAY the stream if the HLS URL
    // is publicly reachable over HTTPS — a localhost/LAN base resolves the event
    // but the video won't load (unreachable + mixed-content). Flag it so the
    // operator knows to set HLS_BASE for public playback.
    const localHls = /^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|[^/]+\.local)/.test(hlsUrl);

    return NextResponse.json({
      ok: true,
      stream: {
        source: url,
        title: meta.title || null,
        uploader: meta.uploader || null,
        id,
        hls: hlsUrl,
        rtmp: rtmpUrl,
      },
      nostr: {
        npub,
        nsec: returnNsec ? nsec : undefined,
        naddr,
        liveEventId,
        profileEventId: profileResult.id,
        publishedToRelays: relays,
      },
      watch: {
        zapStream: `https://zap.stream/${naddr}`,
        njump: `https://njump.me/${naddr}`,
      },
      lightning: {
        address: lightningAddress,
        claimWith: "https://npub.cash",
      },
      warning: localHls
        ? "This HLS URL is local-only, so remote viewers (zap.stream) will see the event but can't play the video. Set HLS_BASE to a public HTTPS URL (reverse proxy / tunnel) for off-network playback."
        : undefined,
    });
  } catch (e: any) {
    console.error("Error starting stream:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to start stream" },
      { status: 500 }
    );
  }
}