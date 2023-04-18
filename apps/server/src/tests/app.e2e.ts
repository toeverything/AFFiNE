import { ok } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../app';
import { getDefaultAFFiNEConfig } from '../config/default';

const gql = '/graphql';

globalThis.AFFiNE = getDefaultAFFiNEConfig();
let app: INestApplication;

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
  await request(app.getHttpServer())
    .post(gql)
    .send({
      query: `
      mutation {
        createWorkspace {
          id
          type
          public
          created_at
        }
      }
    `,
    })
    .expect(200)
    .expect(res => {
      console.log(res.body.data);
      ok(
        typeof res.body.data.createWorkspace === 'object',
        'res.body.data.createWorkspace is not an object'
      );
      ok(
        typeof res.body.data.createWorkspace.id === 'string',
        'res.body.data.createWorkspace.id is not a string'
      );
      ok(
        typeof res.body.data.createWorkspace.type === 'string',
        'res.body.data.createWorkspace.type is not a string'
      );
      ok(
        typeof res.body.data.createWorkspace.public === 'boolean',
        'res.body.data.createWorkspace.public is not a boolean'
      );
      ok(
        typeof res.body.data.createWorkspace.created_at === 'string',
        'res.body.data.createWorkspace.created_at is not a string'
      );
    });
});
