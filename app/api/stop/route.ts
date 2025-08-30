import { NextRequest, NextResponse } from "next/server";
import { stopMirror, getMirrorStatus } from "@/lib/mirror";
import { publishEvent, endEventTemplate } from "@/lib/nostr";

export async function POST(req: NextRequest) {
  try {
    const { id, nsec } = await req.json() as { id?: string; nsec?: string };
    
    if (!id) {
      return NextResponse.json(
        { error: "Stream ID required." },
        { status: 400 }
      );
    }

    // Get current stream status
    const mirrorStatus = getMirrorStatus(id);
    if (!mirrorStatus) {
      return NextResponse.json(
        { error: "Stream not found or already stopped." },
        { status: 404 }
      );
    }

    // Stop the mirror process
    const stopped = stopMirror(id);
    if (!stopped) {
      return NextResponse.json(
        { error: "Failed to stop stream." },
        { status: 500 }
      );
    }

    // If nsec provided, publish end event to Nostr
    let endEventId: string | undefined;
    if (nsec) {
      try {
        const { nip19 } = await import("nostr-tools");
        const decoded = nip19.decode(nsec);
        if (decoded.type !== 'nsec') {
          throw new Error('Invalid nsec');
        }
        const skHex = decoded.data as string;
        const { getPublicKey } = await import("nostr-tools");
        const pkHex = getPublicKey(skHex);

        // Publish end event
        const endEvt = endEventTemplate({
          pkHex,
          dTag: id,
          streamingUrl: mirrorStatus.hlsUrl,
        });
        
        const result = await publishEvent(skHex, endEvt);
        endEventId = result.id;
        console.log(`Published end event with ID: ${endEventId}`);
      } catch (e) {
        console.error("Failed to publish end event:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Stream stopped successfully.",
      streamId: id,
      endEventId,
    });
  } catch (e: any) {
    console.error("Error stopping stream:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to stop stream" },
      { status: 500 }
    );
  }
}