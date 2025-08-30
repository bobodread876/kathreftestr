import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  // WebSocket upgrade is handled by server.js
  // This route just needs to exist for Next.js routing
  return new Response("WebSocket endpoint", { status: 200 });
}