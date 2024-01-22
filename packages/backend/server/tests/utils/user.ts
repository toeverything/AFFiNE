import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import type { TokenType } from '../../src/core/auth';
import type { UserType } from '../../src/core/users';
import { gql } from './common';

export async function signUp(
  app: INestApplication,
  name: string,
  email: string,
  password: string
): Promise<UserType & { token: TokenType }> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
            mutation {
              signUp(name: "${name}", email: "${email}", password: "${password}") {
                id, name, email, token { token }
              }
            }
          `,
    })
    .expect(200);
  return res.body.data.signUp;
}

export async function currentUser(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
            query {
              currentUser {
                id, name, email, emailVerified, avatarUrl, createdAt, hasPassword,
                token { token }
              }
            }
          `,
    })
    .expect(200);
  return res.body.data.currentUser;
}

export async function sendChangeEmail(
  app: INestApplication,
  userToken: string,
  email: string,
  callbackUrl: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
            mutation {
              sendChangeEmail(email: "${email}", callbackUrl: "${callbackUrl}")
            }
          `,
    })
    .expect(200);

  return res.body.data.sendChangeEmail;
}

export async function sendVerifyChangeEmail(
  app: INestApplication,
  userToken: string,
  token: string,
  email: string,
  callbackUrl: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
            mutation {
              sendVerifyChangeEmail(token:"${token}", email: "${email}", callbackUrl: "${callbackUrl}")
            }
          `,
    })
    .expect(200);

  return res.body.data.sendVerifyChangeEmail;
}

export async function changeEmail(
  app: INestApplication,
  userToken: string,
  token: string
): Promise<UserType & { token: TokenType }> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
            mutation {
               changeEmail(token: "${token}") {
                id
                name
                avatarUrl
                email
              }
            }
          `,
    })
    .expect(200);
  return res.body.data.changeEmail;
}
