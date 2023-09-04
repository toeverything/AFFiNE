import { ok, rejects } from 'node:assert';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../app';
import { currentUser, signUp } from './utils';

let app: INestApplication;

// cleanup database before each test
test.beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
  await client.$disconnect();
});

test.beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();
});

test.afterEach(async () => {
  await app.close();
});

test('should register a user', async t => {
  const user = await signUp(app, 'u1', 'u1@affine.pro', '123456');
  ok(typeof user.id === 'string', 'user.id is not a string');
  ok(user.name === 'u1', 'user.name is not valid');
  ok(user.email === 'u1@affine.pro', 'user.email is not valid');
  t.pass();
});

test('should get current user', async t => {
  const user = await signUp(app, 'u1', 'u1@affine.pro', '123456');
  const currUser = await currentUser(app, user.token.token);
  ok(currUser.id === user.id, 'user.id is not valid');
  ok(currUser.name === user.name, 'user.name is not valid');
  ok(currUser.email === user.email, 'user.email is not valid');
  ok(currUser.hasPassword, 'currUser.hasPassword is not valid');
  t.pass();
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
  await rejects(currentUser(app, user.token.token));
  t.pass();
});
