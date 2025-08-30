import { generatePrivateKey, getPublicKey } from "nostr-tools";
import { nip19 } from "nostr-tools";

export interface Keypair {
  skHex: string;
  pkHex: string;
  nsec: string;
  npub: string;
}

export function generateKeypair(): Keypair {
  const skHex = generatePrivateKey(); // 32-byte hex
  const pkHex = getPublicKey(skHex);
  const nsec = nip19.nsecEncode(skHex);
  const npub = nip19.npubEncode(pkHex);
  return { skHex, pkHex, nsec, npub };
}

export function derivePublicKey(nsec: string): string {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec');
  }
  return getPublicKey(decoded.data as string);
}