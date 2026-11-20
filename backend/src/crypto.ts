// Workers limita PBKDF2 a 100 000 iteraciones.
const iterations = 100_000;
const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string) {
  return new Uint8Array((hex.match(/../g) ?? []).map((byte) => parseInt(byte, 16)));
}

export function randomHex(bytes: number) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(value: string) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function derive(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 512));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${toHex(salt)}:${toHex(await derive(password, salt))}`;
}

const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(128)}`;

// Siempre deriva la llave, aunque el usuario no exista, para no revelar qué correos están registrados.
export async function verifyPassword(password: string, stored: string | undefined) {
  const [salt, expected] = (stored ?? dummyHash).split(':');
  const actual = await derive(password, fromHex(salt));
  const target = fromHex(expected);
  let diff = actual.length ^ target.length;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ (target[i] ?? 0);
  return stored !== undefined && diff === 0;
}
