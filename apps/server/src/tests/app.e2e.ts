import { ok } from 'node:assert';
import { randomUUID } from 'node:crypto';

import { Transformer } from '@napi-rs/image';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashSync } from '@node-rs/argon2';
import { User } from '@prisma/client';
import ava, { TestFn } from 'ava';
import { Express } from 'express';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../app';
import { PrismaService } from '../prisma/service';

const gql = '/graphql';

const test = ava as TestFn<{
  app: INestApplication;
}>;

class FakePrisma {
  fakeUser: User = {
    id: randomUUID(),
    name: 'Alex Yang',
    avatarUrl: '',
    email: 'alex.yang@example.org',
    password: hashSync('123456'),
    emailVerified: new Date(),
    createdAt: new Date(),
  };
  get user() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const prisma = this;
    return {
      async findFirst() {
        return prisma.fakeUser;
      },
      async findUnique() {
        return this.findFirst();
      },
      async update() {
        return this.findFirst();
      },
    };
  }
}

test.beforeEach(async t => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useClass(FakePrisma)
    .compile();
  t.context.app = module.createNestApplication({
    cors: true,
    bodyParser: true,
  });
  t.context.app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await t.context.app.init();
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should init app', async t => {
  t.is(typeof t.context.app, 'object');
  await request(t.context.app.getHttpServer())
    .post(gql)
    .send({
      query: `
          query {
            error
          }
        `,
    })
    .expect(400);

  const { token } = await createToken(t.context.app);

  await request(t.context.app.getHttpServer())
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
      t.is(res.body.data.__typename, 'Query');
    });
});

test('should find default user', async t => {
  const { token } = await createToken(t.context.app);
  await request(t.context.app.getHttpServer())
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
      t.is(res.body.data.user.email, 'alex.yang@example.org');
    });
});

test('should be able to upload avatar', async t => {
  const { token, id } = await createToken(t.context.app);
  const png = await Transformer.fromRgbaPixels(
    Buffer.alloc(400 * 400 * 4).fill(255),
    400,
    400
  ).png();

  await request(t.context.app.getHttpServer())
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
      t.is(res.body.data.uploadAvatar.id, id);
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
