import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import {
  TokenType,
  VerificationTokenModel,
} from '../../models/verification-token';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  verificationToken: VerificationTokenModel;
  db: PrismaClient;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({});

  t.context.verificationToken = module.get(VerificationTokenModel);
  t.context.db = module.get(PrismaClient);
  t.context.module = module;
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after(async t => {
  await t.context.module.close();
});

test('should be able to create token', async t => {
  const { verificationToken } = t.context;
  const token = await verificationToken.create(
    TokenType.SignIn,
    'user@affine.pro'
  );

  t.truthy(
    await verificationToken.verify(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );
});

test('should be able to get token', async t => {
  const { verificationToken } = t.context;
  const token = await verificationToken.create(
    TokenType.SignIn,
    'user@affine.pro'
  );

  t.truthy(await verificationToken.get(TokenType.SignIn, token));
  // will be delete after the first time of verification
  t.falsy(await verificationToken.get(TokenType.SignIn, token));
});

test('should be able to get token and keep work', async t => {
  const { verificationToken } = t.context;
  const token = await verificationToken.create(
    TokenType.SignIn,
    'user@affine.pro'
  );

  t.truthy(await verificationToken.get(TokenType.SignIn, token, true));
  t.truthy(await verificationToken.get(TokenType.SignIn, token));
  t.falsy(await verificationToken.get(TokenType.SignIn, token));
});

test('should fail the verification if the token is invalid', async t => {
  const { verificationToken } = t.context;
  const token = await verificationToken.create(
    TokenType.SignIn,
    'user@affine.pro'
  );

  // wrong type
  t.falsy(
    await verificationToken.verify(TokenType.ChangeEmail, token, {
      credential: 'user@affine.pro',
    })
  );

  // no credential
  t.falsy(await verificationToken.verify(TokenType.SignIn, token));

  // wrong credential
  t.falsy(
    await verificationToken.verify(TokenType.SignIn, token, {
      credential: 'wrong@affine.pro',
    })
  );
});

test('should fail if the token expired', async t => {
  const { verificationToken, db } = t.context;
  const token = await verificationToken.create(
    TokenType.SignIn,
    'user@affine.pro'
  );

  await db.verificationToken.updateMany({
    data: {
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  t.falsy(
    await verificationToken.verify(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );
});

test('should be able to verify without credential', async t => {
  const { verificationToken } = t.context;
  const token = await verificationToken.create(TokenType.SignIn);

  t.truthy(await verificationToken.verify(TokenType.SignIn, token));

  // will be invalid after the first time of verification
  t.falsy(await verificationToken.verify(TokenType.SignIn, token));
});

test('should be able to verify only once', async t => {
  const { verificationToken } = t.context;
  const token = await verificationToken.create(
    TokenType.SignIn,
    'user@affine.pro'
  );

  t.truthy(
    await verificationToken.verify(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );

  // will be invalid after the first time of verification
  t.falsy(
    await verificationToken.verify(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );
});

test('should be able to verify and keep work', async t => {
  const { verificationToken } = t.context;
  const token = await verificationToken.create(
    TokenType.SignIn,
    'user@affine.pro'
  );

  t.truthy(
    await verificationToken.verify(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
      keep: true,
    })
  );

  t.truthy(
    await verificationToken.verify(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );

  // will be invalid without keep
  t.falsy(
    await verificationToken.verify(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );
});

test('should cleanup expired tokens', async t => {
  const { verificationToken, db } = t.context;
  await verificationToken.create(TokenType.SignIn, 'user@affine.pro');

  await db.verificationToken.updateMany({
    data: {
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  let count = await verificationToken.cleanExpired();
  t.is(count, 1);
  count = await verificationToken.cleanExpired();
  t.is(count, 0);
});
