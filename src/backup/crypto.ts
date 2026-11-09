/** تشفير ملف النسخة الاحتياطية بكلمة سر عبر WebCrypto. */

const ITERATIONS = 600_000;
const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export interface EncryptedPayload {
  salt: string;
  iv: string;
  iterations: number;
  ciphertext: string;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encryptText(text: string, password: string, iterations = ITERATIONS): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(text));
  return { salt: toBase64(salt), iv: toBase64(iv), iterations, ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export class WrongPasswordError extends Error {}

export async function decryptText(payload: EncryptedPayload, password: string): Promise<string> {
  const key = await deriveKey(password, fromBase64(payload.salt), payload.iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) as BufferSource }, key, fromBase64(payload.ciphertext) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPasswordError('كلمة السر غلط');
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
