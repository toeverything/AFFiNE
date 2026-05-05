export type PasswordEncryptedPayload = {
  version: 1;
  type: 'affine:password-encrypted';
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  encoding: 'base64';
};

export type PasswordEncryptOptions = {
  iterations?: number;
};

export type PasswordAesSession = {
  key: CryptoKey;
  iterations: number;
  salt: string;
};

const AES_KEY_LENGTH = 256;
const DEFAULT_ITERATIONS = 210_000;
const IV_LENGTH = 12;
const MAX_ITERATIONS = 5_000_000;
const SALT_LENGTH = 16;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function getWebCrypto(): Crypto {
  const crypto = globalThis.crypto;

  if (!crypto?.subtle) {
    throw new Error('Web Crypto API is not available.');
  }

  return crypto;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getWebCrypto().getRandomValues(bytes);
  return bytes;
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (ArrayBuffer.isView(data)) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return bytes.slice().buffer;
  }

  return data;
}

function assertSupportedIterations(iterations: number) {
  if (
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    iterations > MAX_ITERATIONS
  ) {
    throw new Error('Unsupported encrypted payload iterations.');
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  if (!password) {
    throw new Error('Password is required.');
  }

  const crypto = getWebCrypto();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations,
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: AES_KEY_LENGTH,
    },
    false,
    usages
  );
}

function assertSupportedPayload(payload: PasswordEncryptedPayload) {
  if (
    payload.version !== 1 ||
    payload.algorithm !== 'AES-GCM' ||
    payload.kdf !== 'PBKDF2' ||
    payload.hash !== 'SHA-256' ||
    payload.encoding !== 'base64'
  ) {
    throw new Error('Unsupported encrypted payload.');
  }

  assertSupportedIterations(payload.iterations);
}

async function decryptBytesWithKey(
  payload: PasswordEncryptedPayload,
  key: CryptoKey
): Promise<Uint8Array> {
  const crypto = getWebCrypto();
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
      },
      key,
      toArrayBuffer(ciphertext)
    );

    return new Uint8Array(plaintext);
  } catch {
    throw new Error('Unable to decrypt payload with the provided password.');
  }
}

export async function createPasswordAesSession(
  payload: PasswordEncryptedPayload,
  password: string
): Promise<PasswordAesSession> {
  assertSupportedPayload(payload);

  return {
    key: await deriveAesKey(
      password,
      base64ToBytes(payload.salt),
      payload.iterations,
      ['decrypt', 'encrypt']
    ),
    iterations: payload.iterations,
    salt: payload.salt,
  };
}

export async function encryptBytesWithSession(
  data: Uint8Array | ArrayBuffer,
  session: PasswordAesSession
): Promise<PasswordEncryptedPayload> {
  const crypto = getWebCrypto();
  const iv = randomBytes(IV_LENGTH);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    session.key,
    toArrayBuffer(data)
  );

  return {
    version: 1,
    type: 'affine:password-encrypted',
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: session.iterations,
    salt: session.salt,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    encoding: 'base64',
  };
}

export async function encryptBytesWithPassword(
  data: Uint8Array | ArrayBuffer,
  password: string,
  options: PasswordEncryptOptions = {}
): Promise<PasswordEncryptedPayload> {
  const crypto = getWebCrypto();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  assertSupportedIterations(iterations);
  const key = await deriveAesKey(password, salt, iterations, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(data)
  );

  return {
    version: 1,
    type: 'affine:password-encrypted',
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    encoding: 'base64',
  };
}

export async function decryptBytesWithPassword(
  payload: PasswordEncryptedPayload,
  password: string
): Promise<Uint8Array> {
  assertSupportedPayload(payload);

  const key = await deriveAesKey(
    password,
    base64ToBytes(payload.salt),
    payload.iterations,
    ['decrypt']
  );

  return decryptBytesWithKey(payload, key);
}

export async function encryptStringWithPassword(
  plaintext: string,
  password: string,
  options?: PasswordEncryptOptions
): Promise<PasswordEncryptedPayload> {
  return encryptBytesWithPassword(encoder.encode(plaintext), password, options);
}

export async function decryptStringWithPassword(
  payload: PasswordEncryptedPayload,
  password: string
): Promise<string> {
  const bytes = await decryptBytesWithPassword(payload, password);
  return decoder.decode(bytes);
}

export async function decryptStringWithSession(
  payload: PasswordEncryptedPayload,
  session: PasswordAesSession
): Promise<string> {
  assertSupportedPayload(payload);

  const bytes = await decryptBytesWithKey(payload, session.key);
  return decoder.decode(bytes);
}

export async function encryptStringWithSession(
  plaintext: string,
  session: PasswordAesSession
): Promise<PasswordEncryptedPayload> {
  return encryptBytesWithSession(encoder.encode(plaintext), session);
}
