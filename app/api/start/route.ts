import { NextRequest, NextResponse } from "next/server";
import { generateKeypair } from "@/lib/keys";
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

    // 4) Publish profile metadata (kind:0) with LUD-16
    // This allows clients to discover the zap address from profile
    const profileEvt = profileKind0Template({
      pkHex,
      name: `Stream ${id}`,
      lud16: lightningAddress,
      about: `Mirrored stream from ${urlObj.hostname}`,
      picture: process.env.DEFAULT_THUMB,
      website: url,
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
      title: `Live from ${urlObj.hostname}`,
      summary: `Mirrored with consent for development from ${url}`,
      image: process.env.DEFAULT_THUMB,
      zapPubkeyHex: pkHex, // direct zaps to this pubkey
    });
    
    console.log("Publishing live event...");
    const { id: liveEventId, relays } = await publishEvent(skHex, liveEvt);
    console.log(`Live event published with ID: ${liveEventId}`);
    console.log(`Published to relays: ${relays.join(", ")}`);

    // Wait a bit for HLS to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // NOTE: dev ONLY — you probably don't want to return nsec in production.
    const returnNsec = process.env.RETURN_NSEC === "true";

    return NextResponse.json({
      ok: true,
      stream: {
        source: url,
        id,
        hls: hlsUrl,
        rtmp: rtmpUrl,
      },
      nostr: {
        npub,
        nsec: returnNsec ? nsec : undefined,
        liveEventId,
        profileEventId: profileResult.id,
        publishedToRelays: relays,
      },
      lightning: {
        address: lightningAddress,
      }
    });
  } catch (e: any) {
    console.error("Error starting stream:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to start stream" },
      { status: 500 }
    );
  }
}