import { randomUUID } from 'node:crypto';

import type { TestFn } from 'ava';
import ava from 'ava';

import {
  createBmp,
  createTestingApp,
  getPublicUserById,
  smallestPng,
  TestingApp,
  updateAvatar,
} from '../utils';

const test = ava as TestFn<{
  app: TestingApp;
}>;

test.before(async t => {
  const app = await createTestingApp();
  t.context.app = app;
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should be able to upload user avatar', async t => {
  const { app } = t.context;

  await app.signup();
  const avatar = await fetch(smallestPng)
    .then(res => res.arrayBuffer())
    .then(b => Buffer.from(b));
  const res = await updateAvatar(app, avatar);

  t.is(res.status, 200);
  const avatarUrl = res.body.data.uploadAvatar.avatarUrl;
  t.truthy(avatarUrl);

  const avatarRes = await app.GET(new URL(avatarUrl).pathname);

  t.true(avatarRes.headers['content-type'].startsWith('image/webp'));
  t.notDeepEqual(avatarRes.body, avatar);
  t.is(avatarRes.body.subarray(0, 4).toString('ascii'), 'RIFF');
  t.is(avatarRes.body.subarray(8, 12).toString('ascii'), 'WEBP');
});

test('should be able to update user avatar, and invalidate old avatar url', async t => {
  const { app } = t.context;

  await app.signup();
  const avatar = await fetch(smallestPng)
    .then(res => res.arrayBuffer())
    .then(b => Buffer.from(b));
  let res = await updateAvatar(app, avatar);

  const oldAvatarUrl = res.body.data.uploadAvatar.avatarUrl;

  const newAvatar = createBmp(32, 32);
  res = await updateAvatar(app, newAvatar);
  const newAvatarUrl = res.body.data.uploadAvatar.avatarUrl;

  t.not(oldAvatarUrl, newAvatarUrl);

  const avatarRes = await app.GET(new URL(oldAvatarUrl).pathname);
  t.is(avatarRes.status, 404);

  const newAvatarRes = await app.GET(new URL(newAvatarUrl).pathname);
  t.true(newAvatarRes.headers['content-type'].startsWith('image/webp'));
  t.notDeepEqual(newAvatarRes.body, newAvatar);
  t.is(newAvatarRes.body.subarray(0, 4).toString('ascii'), 'RIFF');
  t.is(newAvatarRes.body.subarray(8, 12).toString('ascii'), 'WEBP');
});

test('should accept avatar uploads up to 5MB after conversion', async t => {
  const { app } = t.context;

  await app.signup();
  const avatar = createBmp(1024, 1024);
  t.true(avatar.length > 500 * 1024);
  t.true(avatar.length < 5 * 1024 * 1024);

  const res = await updateAvatar(app, avatar, {
    filename: 'large.bmp',
    contentType: 'image/bmp',
  });

  t.is(res.status, 200);
  const avatarUrl = res.body.data.uploadAvatar.avatarUrl;
  const avatarRes = await app.GET(new URL(avatarUrl).pathname);

  t.true(avatarRes.headers['content-type'].startsWith('image/webp'));
});

test('should reject unsupported vector avatars', async t => {
  const { app } = t.context;

  await app.signup();
  const avatar = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'
  );
  const res = await updateAvatar(app, avatar, {
    filename: 'avatar.svg',
    contentType: 'image/svg+xml',
  });

  t.is(res.status, 200);
  t.is(res.body.errors[0].message, 'Image format not supported: image/svg+xml');
});

test('should be able to get public user by id', async t => {
  const { app } = t.context;

  const u1 = await app.signup();
  const avatar = await fetch(smallestPng)
    .then(res => res.arrayBuffer())
    .then(b => Buffer.from(b));
  await updateAvatar(app, avatar);
  const u2 = await app.signup();

  // login user can access
  let user1 = await getPublicUserById(app, u1.id);
  t.truthy(user1);
  t.is(user1!.id, u1.id);
  t.is(user1!.name, u1.name);
  t.truthy(user1!.avatarUrl);
  let user2 = await getPublicUserById(app, u2.id);
  t.deepEqual(user2, {
    id: u2.id,
    name: u2.name,
    avatarUrl: null,
  });
  let user3 = await getPublicUserById(app, randomUUID());
  t.is(user3, null);

  // anonymous user can access
  await app.logout();
  user1 = await getPublicUserById(app, u1.id);
  t.truthy(user1);
  t.is(user1!.id, u1.id);
  t.is(user1!.name, u1.name);
  t.truthy(user1!.avatarUrl);
  user2 = await getPublicUserById(app, u2.id);
  t.deepEqual(user2, {
    id: u2.id,
    name: u2.name,
    avatarUrl: null,
  });
  user3 = await getPublicUserById(app, randomUUID());
  t.is(user3, null);
});
