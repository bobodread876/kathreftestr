import { SimplePool } from "nostr-tools/pool";
import { EventTemplate, finalizeEvent, Event } from "nostr-tools/pure";
import * as nip19 from "nostr-tools/nip19";
import { hexToBytes } from "@noble/hashes/utils";

// Sensible defaults so a fresh install publishes to Nostr out of the box —
// without NOSTR_RELAYS set, the mirror would silently reach zero relays (the
// "to Nostr" half of "YouTube to Nostr" would never happen). Override via env.
const DEFAULT_RELAYS = [
  "wss://relay.islandbitcoin.com",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

export const RELAYS = (() => {
  const fromEnv = (process.env.NOSTR_RELAYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_RELAYS;
})();

export type PublishResult = { id: string; relays: string[] };

export async function publishEvent(
  skHex: string,
  evt: EventTemplate
): Promise<PublishResult> {
  const pool = new SimplePool();
  const skBytes = hexToBytes(skHex);
  const signed = finalizeEvent(evt, skBytes);

  // SimplePool.publish returns one promise per relay — await them so the
  // reported relay list reflects relays that actually accepted the event,
  // not just relays we attempted.
  const successRelays: string[] = [];
  const results = await Promise.allSettled(pool.publish(RELAYS, signed));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") successRelays.push(RELAYS[i]);
    else console.error(`Failed to publish to ${RELAYS[i]}:`, r.reason);
  });

  try {
    pool.close(RELAYS);
  } catch {
    // ignore close errors
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
  
  // Advertise where the event lives (NIP-53), using the resolved relay set.
  if (RELAYS.length) {
    tags.push(["relays", ...RELAYS]);
  }

  const evt: EventTemplate = {
    kind: 30311, // NIP-53 Live Event
    created_at: now,
    content: "",
    tags,
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
  } as EventTemplate;
}