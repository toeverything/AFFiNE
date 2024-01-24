import type { INestApplication } from '@nestjs/common';
import test from 'ava';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { createTestingApp, currentUser, signUp } from './utils';

let app: INestApplication;

test.beforeEach(async () => {
  const { app: testApp } = await createTestingApp({
    imports: [AppModule],
  });
  app = testApp;
});

test.afterEach.always(async () => {
  await app.close();
});

test('should register a user', async t => {
  const user = await signUp(app, 'u1', 'u1@affine.pro', '123456');
  t.is(typeof user.id, 'string', 'user.id is not a string');
  t.is(user.name, 'u1', 'user.name is not valid');
  t.is(user.email, 'u1@affine.pro', 'user.email is not valid');
});

test('should get current user', async t => {
  const user = await signUp(app, 'u1', 'u1@affine.pro', '123456');
  const currUser = await currentUser(app, user.token.token);
  t.is(currUser.id, user.id, 'user.id is not valid');
  t.is(currUser.name, user.name, 'user.name is not valid');
  t.is(currUser.email, user.email, 'user.email is not valid');
  t.true(currUser.hasPassword, 'currUser.hasPassword is not valid');
});

test('should be able to delete user', async t => {
  const user = await signUp(app, 'u1', 'u1@affine.pro', '123456');
  await request(app.getHttpServer())
    .post('/graphql')
    .auth(user.token.token, { type: 'bearer' })
    .send({
      query: `
          mutation {
            deleteAccount {
              success
            }
          }
        `,
    })
    .expect(200);
  t.is(await currentUser(app, user.token.token), null);
  t.pass();
});
