const { getPublicKey } = require('nostr-tools/pure');
const nip19 = require('nostr-tools/nip19');

/**
 * Verify that an nsec corresponds to a given npub
 * @param {string} nsec - The private key in nsec format
 * @param {string} npub - The public key in npub format to verify against
 * @returns {boolean} - True if the nsec matches the npub
 */
function verifyNsecOwnership(nsec, npub) {
  try {
    // Decode the nsec to get private key
    const nsecDecoded = nip19.decode(nsec);
    if (nsecDecoded.type !== 'nsec') {
      return false;
    }
    
    // Get public key from private key
    const publicKey = getPublicKey(nsecDecoded.data);
    
    // Decode the npub to compare
    const npubDecoded = nip19.decode(npub);
    if (npubDecoded.type !== 'npub') {
      return false;
    }
    
    // Compare the public keys
    return publicKey === npubDecoded.data;
  } catch (error) {
    console.error('Error verifying nsec ownership:', error);
    return false;
  }
}

/**
 * Get npub from nsec
 * @param {string} nsec - The private key in nsec format
 * @returns {string|null} - The corresponding npub or null if invalid
 */
function getNpubFromNsec(nsec) {
  try {
    const nsecDecoded = nip19.decode(nsec);
    if (nsecDecoded.type !== 'nsec') {
      return null;
    }
    
    const publicKey = getPublicKey(nsecDecoded.data);
    return nip19.npubEncode(publicKey);
  } catch (error) {
    console.error('Error getting npub from nsec:', error);
    return null;
  }
}

module.exports = {
  verifyNsecOwnership,
  getNpubFromNsec
};