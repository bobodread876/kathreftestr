import { SimplePool } from "nostr-tools/pool";
import { EventTemplate, finalizeEvent, Event } from "nostr-tools/pure";
import * as nip19 from "nostr-tools/nip19";
import { hexToBytes } from "@noble/hashes/utils";

const RELAYS = (process.env.NOSTR_RELAYS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

export type PublishResult = { id: string; relays: string[] };

export async function publishEvent(
  skHex: string,
  evt: EventTemplate
): Promise<PublishResult> {
  const pool = new SimplePool();
  const skBytes = hexToBytes(skHex);
  const signed = finalizeEvent(evt, skBytes);
  
  const successRelays: string[] = [];
  
  await Promise.allSettled(
    RELAYS.map(async (relay) => {
      try {
        await pool.publish([relay], signed);
        successRelays.push(relay);
      } catch (e) {
        console.error(`Failed to publish to ${relay}:`, e);
      }
    })
  );
  
  // Close connections properly
  try {
    await pool.close(RELAYS);
  } catch (e) {
    // Ignore close errors
  }
  
  return { id: signed.id!, relays: successRelays };
}

export interface LiveEventParams {
  pkHex: string;
  dTag: string;
  streamingUrl: string;
  title: string;
  summary?: string;
  image?: string;
  zapPubkeyHex?: string;
  starts?: number;
}

export function liveEventTemplate(params: LiveEventParams): EventTemplate {
  const now = Math.floor(Date.now() / 1000);
  const tags: string[][] = [
    ["d", params.dTag],
    ["title", params.title],
    ["summary", params.summary || ""],
    ["image", params.image || process.env.DEFAULT_THUMB || ""],
    ["streaming", params.streamingUrl],
    ["status", "live"],
    ["starts", String(params.starts || now)],
    ["t", "streaming"],
    ["t", "live"],
  ];

  if (params.zapPubkeyHex) {
    tags.push(["zap", params.zapPubkeyHex, "wss://relay.damus.io", "1"]);
  }
  
  if (process.env.NOSTR_RELAYS) {
    const relayList = process.env.NOSTR_RELAYS.split(",").map(s => s.trim());
    tags.push(["relays", ...relayList]);
  }

  const evt: EventTemplate = {
    kind: 30311, // NIP-53 Live Event
    created_at: now,
    content: "",
    tags,
    pubkey: params.pkHex,
  };

  return evt;
}

export interface EndEventParams {
  pkHex: string;
  dTag: string;
  streamingUrl: string;
  recordingUrl?: string;
  ends?: number;
}

export function endEventTemplate(params: EndEventParams): EventTemplate {
  const now = Math.floor(Date.now() / 1000);
  const tags: string[][] = [
    ["d", params.dTag],
    ["status", "ended"],
    ["streaming", params.streamingUrl],
    ["ends", String(params.ends || now)],
  ];
  
  if (params.recordingUrl) {
    tags.push(["recording", params.recordingUrl]);
  }

  const evt: EventTemplate = {
    kind: 30311,
    created_at: now,
    content: "",
    tags,
    pubkey: params.pkHex,
  };
  
  return evt;
}

export interface ProfileParams {
  pkHex: string;
  name?: string;
  lud16?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
}

export function profileKind0Template(params: ProfileParams): EventTemplate {
  const now = Math.floor(Date.now() / 1000);
  const profileData: any = {};
  
  if (params.name) profileData.name = params.name;
  if (params.about) profileData.about = params.about;
  if (params.picture) profileData.picture = params.picture;
  if (params.banner) profileData.banner = params.banner;
  if (params.website) profileData.website = params.website;
  if (params.lud16) profileData.lud16 = params.lud16;
  
  const content = JSON.stringify(profileData);
  
  return {
    kind: 0,
    created_at: now,
    content,
    tags: [],
    pubkey: params.pkHex,
  } as EventTemplate;
}