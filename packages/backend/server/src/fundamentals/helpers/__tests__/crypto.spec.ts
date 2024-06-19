import { createPrivateKey, createPublicKey } from 'node:crypto';

import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { CryptoHelper } from '../crypto';

const test = ava as TestFn<{
  crypto: CryptoHelper;
}>;

const key = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIEtyAJLIULkphVhqXqxk4Nr8Ggty3XLwUJWBxzAWCWTMoAoGCCqGSM49
AwEHoUQDQgAEF3U/0wIeJ3jRKXeFKqQyBKlr9F7xaAUScRrAuSP33rajm3cdfihI
3JvMxVNsS2lE8PSGQrvDrJZaDo0L+Lq9Gg==
-----END EC PRIVATE KEY-----`;
const privateKey = createPrivateKey({
  key,
  format: 'pem',
  type: 'sec1',
})
  .export({
    type: 'pkcs8',
    format: 'pem',
  })
  .toString('utf8');

const publicKey = createPublicKey({
  key,
  format: 'pem',
  type: 'spki',
})
  .export({
    format: 'pem',
    type: 'spki',
  })
  .toString('utf8');

test.beforeEach(async t => {
  t.context.crypto = new CryptoHelper({
    crypto: {
      secret: {
        publicKey,
        privateKey,
      },
    },
  } as any);
});

test('should be able to sign and verify', t => {
  const data = 'hello world';
  const signature = t.context.crypto.sign(data);
  t.true(t.context.crypto.verify(data, signature));
  t.false(t.context.crypto.verify(data, 'fake-signature'));
});

test('should be able to encrypt and decrypt', t => {
  const data = 'top secret';
  const stub = Sinon.stub(t.context.crypto, 'randomBytes').returns(
    Buffer.alloc(12, 0)
  );

  const encrypted = t.context.crypto.encrypt(data);
  const decrypted = t.context.crypto.decrypt(encrypted);

  // we are using a stub to make sure the iv is always 0,
  // the encrypted result will always be the same
  t.is(encrypted, 'AAAAAAAAAAAAAAAAWUDlJRhzP+SZ3avvmLcgnou+q4E11w==');
  t.is(decrypted, data);

  stub.restore();
});

test('should be able to get random bytes', t => {
  const bytes = t.context.crypto.randomBytes();
  t.is(bytes.length, 12);
  const bytes2 = t.context.crypto.randomBytes();

  t.notDeepEqual(bytes, bytes2);
});

test('should be able to digest', t => {
  const data = 'hello world';
  const hash = t.context.crypto.sha256(data).toString('base64');
  t.is(hash, 'uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=');
});

test('should be able to safe compare', t => {
  t.true(t.context.crypto.compare('abc', 'abc'));
  t.false(t.context.crypto.compare('abc', 'def'));
});

test('should be able to hash and verify password', async t => {
  const password = 'mySecurePassword';
  const hash = await t.context.crypto.encryptPassword(password);
  t.true(await t.context.crypto.verifyPassword(password, hash));
  t.false(await t.context.crypto.verifyPassword('wrong-password', hash));
});
