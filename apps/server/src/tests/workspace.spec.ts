import { ok } from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../app';
import { getDefaultAFFiNEConfig } from '../config/default';
import type { TokenType } from '../modules/auth';
import type { UserType } from '../modules/users';
import type { WorkspaceType } from '../modules/workspaces';

const gql = '/graphql';

globalThis.AFFiNE = getDefaultAFFiNEConfig();

describe('AppModule', () => {
  let app: INestApplication;

  // cleanup database before each test
  beforeEach(async () => {
    const client = new PrismaClient();
    await client.$connect();
    await client.user.deleteMany({});
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

  async function registerUser(
    name: string,
    email: string,
    password: string
  ): Promise<UserType & { token: TokenType }> {
    const res = await request(app.getHttpServer())
      .post(gql)
      .send({
        query: `
          mutation {
            register(name: "${name}", email: "${email}", password: "${password}") {
              id, name, email, token { token }
            }
          }
        `,
      })
      .expect(200);
    return res.body.data.register;
  }

  async function createWorkspace(token: string): Promise<WorkspaceType> {
    const res = await request(app.getHttpServer())
      .post(gql)
      .set({ Authorization: token })
      .send({
        query: `
          mutation {
            createWorkspace {
              id
            }
          }
        `,
      })
      .expect(200);
    return res.body.data.createWorkspace;
  }

  test('should register a user', async () => {
    const user = await registerUser(
      'affiner1',
      'affiner1@affine.pro',
      '123456'
    );
    ok(typeof user.id === 'string', 'user.id is not a string');
    ok(user.name === 'affiner1', 'user.name is not valid');
    ok(user.email === 'affiner1@affine.pro', 'user.email is not valid');
  });

  test('should create a workspace', async () => {
    const user = await registerUser(
      'affiner1',
      'affiner1@affine.pro',
      '123456'
    );

    const workspace = await createWorkspace(user.token.token);
    ok(typeof workspace.id === 'string', 'workspace.id is not a string');
  });
});
