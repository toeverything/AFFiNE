import { TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { TokenService, TokenType } from '../../src/core/auth';
import { createTestingModule } from '../utils';

const test = ava as TestFn<{
  ts: TokenService;
  m: TestingModule;
}>;

test.before(async t => {
  const m = await createTestingModule({
    providers: [TokenService],
  });

  t.context.ts = m.get(TokenService);
  t.context.m = m;
});

test.after.always(async t => {
  await t.context.m.close();
});

test('should be able to create token', async t => {
  const { ts } = t.context;
  const token = await ts.createToken(TokenType.SignIn, 'user@affine.pro');

  t.truthy(
    await ts.verifyToken(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );
});

test('should fail the verification if the token is invalid', async t => {
  const { ts } = t.context;

  const token = await ts.createToken(TokenType.SignIn, 'user@affine.pro');

  // wrong type
  t.falsy(
    await ts.verifyToken(TokenType.ChangeEmail, token, {
      credential: 'user@affine.pro',
    })
  );

  // no credential
  t.falsy(await ts.verifyToken(TokenType.SignIn, token));

  // wrong credential
  t.falsy(
    await ts.verifyToken(TokenType.SignIn, token, {
      credential: 'wrong@affine.pro',
    })
  );
});

test('should fail if the token expired', async t => {
  const { ts } = t.context;
  const token = await ts.createToken(TokenType.SignIn, 'user@affine.pro');

  await t.context.m.get(PrismaClient).verificationToken.updateMany({
    data: {
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  t.falsy(
    await ts.verifyToken(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );
});

test('should be able to verify only once', async t => {
  const { ts } = t.context;
  const token = await ts.createToken(TokenType.SignIn, 'user@affine.pro');

  t.truthy(
    await ts.verifyToken(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );

  // will be invalid after the first time of verification
  t.falsy(
    await ts.verifyToken(TokenType.SignIn, token, {
      credential: 'user@affine.pro',
    })
  );
});
