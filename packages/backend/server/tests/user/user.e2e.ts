import type { INestApplication } from '@nestjs/common';
import type { TestFn } from 'ava';
import ava from 'ava';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { AuthService, CurrentUser } from '../../src/core/auth';
import { createTestingApp, gql, internalSignIn } from '../utils';

const test = ava as TestFn<{
  app: INestApplication;
  u1: CurrentUser;
}>;

test.beforeEach(async t => {
  const { app } = await createTestingApp({
    imports: [AppModule],
  });

  t.context.u1 = await app.get(AuthService).signUp('u1@affine.pro', '1');
  t.context.app = app;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

async function fakeUploadAvatar(
  app: INestApplication,
  userId: string,
  avatar: Buffer
) {
  const cookie = await internalSignIn(app, userId);

  return gql(app)
    .set('Cookie', cookie)
    .field(
      'operations',
      JSON.stringify({
        name: 'uploadAvatar',
        query: `mutation uploadAvatar($avatar: Upload!) {
        uploadAvatar(avatar: $avatar) {
          avatarUrl
        }
      }`,
        variables: { avatar: null },
      })
    )
    .field('map', JSON.stringify({ '0': ['variables.avatar'] }))
    .attach('0', avatar, {
      filename: 'test.png',
      contentType: 'image/png',
    });
}

test('should be able to upload user avatar', async t => {
  const { app } = t.context;

  const avatar = Buffer.from('test');
  const res = await fakeUploadAvatar(app, t.context.u1.id, avatar);

  t.is(res.status, 200);
  const avatarUrl = res.body.data.uploadAvatar.avatarUrl;
  t.truthy(avatarUrl);

  const avatarRes = await request(app.getHttpServer())
    .get(new URL(avatarUrl).pathname)
    .expect(200);

  t.deepEqual(avatarRes.body, Buffer.from('test'));
});

test('should be able to update user avatar, and invalidate old avatar url', async t => {
  const { app } = t.context;

  const avatar = Buffer.from('test');
  let res = await fakeUploadAvatar(app, t.context.u1.id, avatar);

  const oldAvatarUrl = res.body.data.uploadAvatar.avatarUrl;

  const newAvatar = Buffer.from('new');
  res = await fakeUploadAvatar(app, t.context.u1.id, newAvatar);
  const newAvatarUrl = res.body.data.uploadAvatar.avatarUrl;

  t.not(oldAvatarUrl, newAvatarUrl);

  await request(app.getHttpServer())
    .get(new URL(oldAvatarUrl).pathname)
    .expect(404);

  const avatarRes = await request(app.getHttpServer())
    .get(new URL(newAvatarUrl).pathname)
    .expect(200);

  t.deepEqual(avatarRes.body, Buffer.from('new'));
});
