export async function encryptPBKDF2(
  source: string,
  secret = 'affine',
  iterations = 100000
) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(source),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const salt = encoder.encode(secret);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
