import { generateKeyPairSync } from 'node:crypto';

import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { CryptoHelper } from '../crypto';

const test = ava as TestFn<{
  crypto: CryptoHelper;
}>;

function generateTestPrivateKey(): string {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return privateKey
    .export({
      type: 'pkcs8',
      format: 'pem',
    })
    .toString();
}

const privateKey = generateTestPrivateKey();
const privateKey2 = generateTestPrivateKey();

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

test('should verify signatures across key rotation', t => {
  const data = 'hello world';
  const signatureV1 = t.context.crypto.sign(data);
  t.true(t.context.crypto.verify(signatureV1));

  (t.context.crypto as any).config.crypto.privateKey = privateKey2;
  t.context.crypto.onConfigChanged({
    updates: { crypto: { privateKey: privateKey2 } },
  } as any);

  const signatureV2 = t.context.crypto.sign(data);
  t.true(t.context.crypto.verify(signatureV1));
  t.true(t.context.crypto.verify(signatureV2));
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
  const encrypted2 = t.context.crypto.encrypt(data);
  const decrypted = t.context.crypto.decrypt(encrypted);

  // we are using a stub to make sure the iv is always 0,
  // the encrypted result will always be the same for the same key+data
  t.is(encrypted2, encrypted);
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

test('should sign and parse internal access token', t => {
  const token = t.context.crypto.signInternalAccessToken({
    method: 'GET',
    path: '/rpc/workspaces/123/docs/456',
    now: 1700000000000,
    nonce: 'nonce-123',
  });

  const payload = t.context.crypto.parseInternalAccessToken(token);
  t.deepEqual(payload, {
    v: 1,
    ts: 1700000000000,
    nonce: 'nonce-123',
    m: 'GET',
    p: '/rpc/workspaces/123/docs/456',
  });
});

test('should be able to hash and verify password', async t => {
  const password = 'mySecurePassword';
  const hash = await t.context.crypto.encryptPassword(password);
  t.true(await t.context.crypto.verifyPassword(password, hash));
  t.false(await t.context.crypto.verifyPassword('wrong-password', hash));
});
