import type { INestApplication } from '@nestjs/common';
import request, { type Response } from 'supertest';

import {
  AuthService,
  type ClientTokenType,
  type CurrentUser,
} from '../../src/core/auth';
import { sessionUser } from '../../src/core/auth/service';
import { UserService, type UserType } from '../../src/core/user';
import { gql } from './common';

export async function internalSignIn(app: INestApplication, userId: string) {
  const auth = app.get(AuthService);

  const session = await auth.createUserSession(userId);

  return `${AuthService.sessionCookieName}=${session.sessionId}`;
}

export function sessionCookie(headers: any): string {
  const cookie = headers['set-cookie']?.find((c: string) =>
    c.startsWith(`${AuthService.sessionCookieName}=`)
  );

  if (!cookie) {
    return '';
  }

  return cookie.split(';')[0];
}

export async function getSession(
  app: INestApplication,
  signInRes: Response
): Promise<{ user?: CurrentUser }> {
  const cookie = sessionCookie(signInRes.headers);
  const res = await request(app.getHttpServer())
    .get('/api/auth/session')
    .set('cookie', cookie!)
    .expect(200);

  return res.body;
}

export async function signUp(
  app: INestApplication,
  name: string,
  email: string,
  password: string,
  autoVerifyEmail = true
): Promise<UserType & { token: ClientTokenType }> {
  const user = await app.get(UserService).createUser({
    name,
    email,
    password,
    emailVerifiedAt: autoVerifyEmail ? new Date() : null,
  });
  const { sessionId } = await app.get(AuthService).createUserSession(user.id);

  return {
    ...sessionUser(user),
    token: { token: sessionId, refresh: '' },
  };
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
                id, name, email, emailVerified, avatarUrl, hasPassword,
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

export async function sendSetPasswordEmail(
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
              sendSetPasswordEmail(email: "${email}", callbackUrl: "${callbackUrl}")
            }
          `,
    })
    .expect(200);

  return res.body.data.sendChangeEmail;
}

export async function changePassword(
  app: INestApplication,
  userId: string,
  token: string,
  password: string
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
            mutation changePassword($token: String!, $userId: String!, $password: String!) {
              changePassword(token: $token, userId: $userId, newPassword: $password)
            }
          `,
      variables: { token, password, userId },
    })
    .expect(200);
  return res.body.data.changePassword;
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
  token: string,
  email: string
): Promise<UserType & { token: ClientTokenType }> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
            mutation {
               changeEmail(token: "${token}", email: "${email}") {
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
