import * as Crypto from 'expo-crypto';

/**
 * The app's own PKCE pair (RFC 7636).
 *
 * Written here rather than taken from `expo-auth-session` for a reason worth
 * recording: that library's `AuthRequest` models an OAuth *client*, and this app
 * is deliberately not one — the backend holds that role and the provider's
 * single allowlist entry (ADR-0017). Its `buildCodeAsync` helper is not exported
 * from the package index either, so using it would mean deep-importing build
 * output. What the contract actually asks of the app is smaller than an OAuth
 * client: mint a verifier, send its S256 challenge, keep the verifier.
 *
 * The verifier binds the one-time code to this device. It never travels in a
 * URL — only in the body of the token exchange.
 */

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 32 bytes encodes to exactly 43 base64url characters, the length the Edge requires. */
const VERIFIER_BYTES = 32;

export type PkcePair = {
  /** Kept on the device until the token exchange. */
  codeVerifier: string;
  /** Base64url SHA-256 of the verifier; exactly 43 characters. */
  codeChallenge: string;
};

export async function createPkcePair(): Promise<PkcePair> {
  const bytes = await Crypto.getRandomBytesAsync(VERIFIER_BYTES);
  const codeVerifier = base64UrlFromBytes(bytes);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { codeVerifier, codeChallenge: base64UrlFromBase64(digest) };
}

/**
 * Encode without padding, straight from bytes.
 *
 * Deriving the verifier from random bytes rather than by indexing an alphabet
 * with `byte % 64` keeps the distribution uniform; 64 divides 256, so this
 * particular alphabet would have been safe either way, but the byte-wise form
 * does not depend on that coincidence.
 */
export function base64UrlFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    out += BASE64URL[b0 >> 2];
    out += BASE64URL[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += BASE64URL[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += BASE64URL[b2 & 0b111111];
  }
  return out;
}

/** Standard base64 (what `digestStringAsync` returns) to the URL alphabet, unpadded. */
export function base64UrlFromBase64(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
