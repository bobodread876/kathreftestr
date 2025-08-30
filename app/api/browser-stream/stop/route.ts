import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { streamId } = await req.json();
    
    // Clean up stream info
    if (global.browserStreams && global.browserStreams[streamId]) {
      delete global.browserStreams[streamId];
    }
    
    // TODO: Stop any running ffmpeg processes for this stream
    
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error stopping browser stream:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to stop browser stream" },
      { status: 500 }
    );
  }
}

declare global {
  var browserStreams: Record<string, any>;
}