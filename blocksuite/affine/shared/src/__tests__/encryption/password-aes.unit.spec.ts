import { describe, expect, test } from 'vitest';

import {
  base64ToBytes,
  bytesToBase64,
  createPasswordAesSession,
  decryptStringWithPassword,
  decryptStringWithSession,
  encryptStringWithPassword,
  encryptStringWithSession,
} from '../../encryption/password-aes.js';

describe('password AES encryption', () => {
  test('encrypts and decrypts a string with a password', async () => {
    const payload = await encryptStringWithPassword(
      'hello encrypted world',
      'p'
    );

    await expect(decryptStringWithPassword(payload, 'p')).resolves.toBe(
      'hello encrypted world'
    );
  });

  test('rejects a wrong password', async () => {
    const payload = await encryptStringWithPassword('secret', 'right');

    await expect(decryptStringWithPassword(payload, 'wrong')).rejects.toThrow(
      'Unable to decrypt payload with the provided password.'
    );
  });

  test('re-encrypts updated content with an unlocked session', async () => {
    const payload = await encryptStringWithPassword('first version', 'p');
    const session = await createPasswordAesSession(payload, 'p');
    const updatedPayload = await encryptStringWithSession(
      'second version',
      session
    );

    await expect(
      decryptStringWithSession(updatedPayload, session)
    ).resolves.toBe('second version');
  });

  test('round-trips base64 bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);

    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
      Array.from(bytes)
    );
  });
});
