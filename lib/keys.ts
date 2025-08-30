import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import * as nip19 from "nostr-tools/nip19";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export interface Keypair {
  skHex: string;
  pkHex: string;
  nsec: string;
  npub: string;
}

export function generateKeypair(): Keypair {
  const sk = generateSecretKey(); // 32-byte Uint8Array
  const skHex = bytesToHex(sk);
  const pkHex = getPublicKey(sk);
  const nsec = nip19.nsecEncode(sk);
  const npub = nip19.npubEncode(pkHex);
  return { skHex, pkHex, nsec, npub };
}

export function derivePublicKey(nsec: string): string {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec');
  }
  return getPublicKey(decoded.data as Uint8Array);
}