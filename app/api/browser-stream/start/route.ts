import { NextRequest, NextResponse } from "next/server";
import { generateKeypair } from "@/lib/keys";
import { publishEvent, profileKind0Template, liveEventTemplate } from "@/lib/nostr";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { sourceUrl, sdp } = await req.json();
    
    // Generate stream ID
    const streamId = crypto.randomUUID().slice(0, 8);
    
    // Generate HLS URL
    const hlsBase = process.env.NODE_ENV === 'production' 
      ? "https://kathreftestr.onrender.com/live"
      : "http://localhost:8890/live";
    const hlsUrl = `${hlsBase}/${streamId}/index.m3u8`;
    const rtmpUrl = `rtmp://localhost:1935/live/${streamId}`;
    
    // Generate Nostr keypair
    const { skHex, pkHex, nsec, npub } = generateKeypair();
    
    // Set Lightning Address
    const lightningDomain = process.env.LIGHTNING_DOMAIN || "npub.cash";
    const lightningAddress = `${npub}@${lightningDomain}`;
    
    // Parse source URL for metadata
    let hostname = "browser";
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        hostname = url.hostname;
      } catch {}
    }
    
    // Publish profile metadata
    const profileEvt = profileKind0Template({
      pkHex,
      name: `Browser Stream ${streamId}`,
      lud16: lightningAddress,
      about: `Browser-captured stream from ${hostname}`,
      picture: process.env.DEFAULT_THUMB,
      website: sourceUrl || "",
    });
    
    const profileResult = await publishEvent(skHex, profileEvt);
    
    // Publish NIP-53 Live Event
    const liveEvt = liveEventTemplate({
      pkHex,
      dTag: streamId,
      streamingUrl: hlsUrl,
      title: `Live from ${hostname}`,
      summary: `Browser-captured stream${sourceUrl ? ` from ${sourceUrl}` : ''}`,
      image: process.env.DEFAULT_THUMB,
      zapPubkeyHex: pkHex,
    });
    
    const { id: liveEventId, relays } = await publishEvent(skHex, liveEvt);
    
    // Store stream info for later reference
    global.browserStreams = global.browserStreams || {};
    global.browserStreams[streamId] = {
      rtmpUrl,
      hlsUrl,
      npub,
      startTime: new Date(),
    };
    
    // Note: WebRTC to RTMP conversion would require additional setup
    // For MVP, we're publishing the stream metadata to Nostr
    // The actual video bridge would need a WebRTC server component
    
    return NextResponse.json({
      ok: true,
      stream: {
        id: streamId,
        hls: hlsUrl,
        rtmp: rtmpUrl,
      },
      nostr: {
        npub,
        liveEventId,
        profileEventId: profileResult.id,
        publishedToRelays: relays,
      },
      lightning: {
        address: lightningAddress,
      },
      note: "Browser streaming requires WebRTC-to-RTMP bridge for full functionality"
    });
    
  } catch (error: any) {
    console.error("Error starting browser stream:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to start browser stream" },
      { status: 500 }
    );
  }
}

// Declare global type
declare global {
  var browserStreams: Record<string, any>;
}