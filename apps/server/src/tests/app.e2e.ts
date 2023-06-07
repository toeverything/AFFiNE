import { equal, ok } from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/bcrypt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../app';
import { getDefaultAFFiNEConfig } from '../config/default';

const gql = '/graphql';

globalThis.AFFiNE = getDefaultAFFiNEConfig();

describe('AppModule', () => {
  let app: INestApplication;

  // cleanup database before each test
  beforeEach(async () => {
    const client = new PrismaClient();
    await client.$connect();
    await client.user.deleteMany({});
    await client.user.create({
      data: {
        id: '1',
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
    app = module.createNestApplication();
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

    let token;
    await request(app.getHttpServer())
      .post(gql)
      .send({
        query: `
          mutation {
            signIn(email: "alex.yang@example.org", password: "123456") {
              token {
                token
              }
            }
          }
        `,
      })
      .expect(200)
      .expect(res => {
        ok(
          typeof res.body.data.signIn.token.token === 'string',
          'res.body.data.signIn.token.token is not a string'
        );
        token = res.body.data.signIn.token.token;
      });

    await request(app.getHttpServer())
      .post(gql)
      .set({ Authorization: token })
      .send({
        query: `
      mutation {
        createWorkspace {
          id
          public
          createdAt
        }
      }
    `,
      })
      .expect(200)
      .expect(res => {
        ok(
          typeof res.body.data.createWorkspace === 'object',
          'res.body.data.createWorkspace is not an object'
        );
        ok(
          typeof res.body.data.createWorkspace.id === 'string',
          'res.body.data.createWorkspace.id is not a string'
        );
        ok(
          typeof res.body.data.createWorkspace.public === 'boolean',
          'res.body.data.createWorkspace.public is not a boolean'
        );
        ok(
          typeof res.body.data.createWorkspace.createdAt === 'string',
          'res.body.data.createWorkspace.created_at is not a string'
        );
      });
  });

  test('should find default user', async () => {
    await request(app.getHttpServer())
      .post(gql)
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
});
