import { equal, ok } from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { Transformer } from '@napi-rs/image';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { Express } from 'express';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../app';

const gql = '/graphql';

describe('AppModule', () => {
  let app: INestApplication;

  // cleanup database before each test
  beforeEach(async () => {
    const client = new PrismaClient();
    await client.$connect();
    await client.user.deleteMany({});
    await client.user.create({
      data: {
        name: 'Alex Yang',
        email: 'alex.yang@example.org',
        password: await hash('123456'),
      },
    });
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({
      cors: true,
      bodyParser: true,
    });
    app.use(
      graphqlUploadExpress({
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 5,
      })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  test('should init app', async () => {
    ok(typeof app === 'object');
    await request(app.getHttpServer())
      .post(gql)
      .send({
        query: `
          query {
            error
          }
        `,
      })
      .expect(400);

    const { token } = await createToken(app);

    await request(app.getHttpServer())
      .post(gql)
      .auth(token, { type: 'bearer' })
      .send({
        query: `
      query {
        __typename
      }
    `,
      })
      .expect(200)
      .expect(res => {
        ok(res.body.data.__typename === 'Query');
      });
  });

  test('should find default user', async () => {
    const { token } = await createToken(app);
    await request(app.getHttpServer())
      .post(gql)
      .auth(token, { type: 'bearer' })
      .send({
        query: `
      query {
        user(email: "alex.yang@example.org") {
          email
          avatarUrl
        }
      }
    `,
      })
      .expect(200)
      .expect(res => {
        equal(res.body.data.user.email, 'alex.yang@example.org');
      });
  });

  test('should be able to upload avatar', async () => {
    const { token, id } = await createToken(app);
    const png = await Transformer.fromRgbaPixels(
      Buffer.alloc(400 * 400 * 4).fill(255),
      400,
      400
    ).png();

    await request(app.getHttpServer())
      .post(gql)
      .auth(token, { type: 'bearer' })
      .field(
        'operations',
        JSON.stringify({
          name: 'uploadAvatar',
          query: `mutation uploadAvatar($id: String!, $avatar: Upload!) {
          uploadAvatar(id: $id, avatar: $avatar) {
            id
            name
            avatarUrl
            email
          }
        }
        `,
          variables: { id, avatar: null },
        })
      )

      .field('map', JSON.stringify({ '0': ['variables.avatar'] }))
      .attach('0', png, 'avatar.png')
      .expect(200)
      .expect(res => {
        equal(res.body.data.uploadAvatar.id, id);
      });
  });
});

async function createToken(app: INestApplication<Express>): Promise<{
  id: string;
  token: string;
}> {
  let token;
  let id;
  await request(app.getHttpServer())
    .post(gql)
    .send({
      query: `
          mutation {
            signIn(email: "alex.yang@example.org", password: "123456") {
              id
              token {
                token
              }
            }
          }
        `,
    })
    .expect(200)
    .expect(res => {
      id = res.body.data.signIn.id;
      ok(
        typeof res.body.data.signIn.token.token === 'string',
        'res.body.data.signIn.token.token is not a string'
      );
      token = res.body.data.signIn.token.token;
    });
  return { token: token!, id: id! };
}
