import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { CryptoHelper } from '../crypto';

const test = ava as TestFn<{
  crypto: CryptoHelper;
}>;

const privateKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgS3IAkshQuSmFWGpe
rGTg2vwaC3LdcvBQlYHHMBYJZMyhRANCAAQXdT/TAh4neNEpd4UqpDIEqWv0XvFo
BRJxGsC5I/fetqObdx1+KEjcm8zFU2xLaUTw9IZCu8OslloOjQv4ur0a
-----END PRIVATE KEY-----`;

test.beforeEach(async t => {
  t.context.crypto = new CryptoHelper({
    crypto: {
      privateKey,
    },
  } as any);
  t.context.crypto.onConfigInit();
});

test('should be able to sign and verify', t => {
  const data = 'hello world';
  const signature = t.context.crypto.sign(data);
  t.true(t.context.crypto.verify(signature));
  t.false(t.context.crypto.verify('fake-signature'));
  t.false(t.context.crypto.verify(`${data},fake-signature`));
});

test('should same data should get different signature', t => {
  const data = 'hello world';
  const signature = t.context.crypto.sign(data);
  const signature2 = t.context.crypto.sign(data);
  t.not(signature2, signature);
  t.true(t.context.crypto.verify(signature));
  t.true(t.context.crypto.verify(signature2));
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
  t.is(encrypted, 'AAAAAAAAAAAAAAAAOXbR/9glITL3BcO3kPd6fGOMasSkPQ==');
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
