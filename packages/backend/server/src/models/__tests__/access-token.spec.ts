import { PrismaClient } from '@prisma/client';
import test from 'ava';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { Due } from '../../base';
import { Models } from '..';

const module = await createModule();
const models = module.get(Models);

test.after.always(async () => {
  await module.close();
});

test('should create access token', async t => {
  const user = await module.create(Mockers.User);

  const token = await models.accessToken.create({
    userId: user.id,
    name: 'test',
  });

  t.is(token.userId, user.id);
  t.is(token.name, 'test');
  t.truthy(token.token);
  t.true(token.token.startsWith('ut_'));
  t.truthy(token.createdAt);
  t.is(token.expiresAt, null);

  const row = await module.get(PrismaClient).accessToken.findUnique({
    where: { id: token.id },
  });
  t.truthy(row);
  t.regex(row!.token, /^[0-9a-f]{64}$/);
  t.not(row!.token, token.token);
});

test('should create access token with expiration', async t => {
  const user = await module.create(Mockers.User);

  const token = await models.accessToken.create({
    userId: user.id,
    name: 'test',
    expiresAt: Due.after('30d'),
  });

  t.truthy(token.expiresAt);
  t.truthy(token.expiresAt! > new Date());
});

test('should list access tokens without token value', async t => {
  const user = await module.create(Mockers.User);
  await module.create(Mockers.AccessToken, { userId: user.id }, 3);

  const listed = await models.accessToken.list(user.id);
  t.is(listed.length, 3);
  // @ts-expect-error not exists
  t.is(listed[0].token, undefined);
});

test('should not reveal access token value after creation', async t => {
  const user = await module.create(Mockers.User);

  const token = await models.accessToken.create({
    userId: user.id,
    name: 'test',
  });

  const listed = await models.accessToken.list(user.id, true);
  const found = listed.find(item => item.id === token.id);

  t.truthy(found);
  t.is(found!.token, '[REDACTED]');
  t.not(found!.token, token.token);
});

test('should be able to revoke access token', async t => {
  const user = await module.create(Mockers.User);
  const token = await module.create(Mockers.AccessToken, { userId: user.id });

  await models.accessToken.revoke(token.id, user.id);

  const listed = await models.accessToken.list(user.id);
  t.is(listed.length, 0);
});

test('should be able to get access token by token value', async t => {
  const user = await module.create(Mockers.User);
  const token = await models.accessToken.create({
    userId: user.id,
    name: 'test',
  });

  const found = await models.accessToken.getByToken(token.token);
  t.is(found?.id, token.id);
  t.is(found?.userId, user.id);
  t.is(found?.name, token.name);
});

test('should not get expired access token', async t => {
  const user = await module.create(Mockers.User);
  const token = await models.accessToken.create({
    userId: user.id,
    name: 'test',
    expiresAt: Due.before('1s'),
  });

  const found = await models.accessToken.getByToken(token.token);
  t.is(found, null);
});
