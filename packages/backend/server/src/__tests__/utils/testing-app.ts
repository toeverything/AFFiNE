import { randomUUID } from 'node:crypto';

import { INestApplication, ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { TestingModuleBuilder } from '@nestjs/testing';
import { PrismaClient, User } from '@prisma/client';
import cookieParser from 'cookie-parser';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import supertest from 'supertest';

import {
  AFFiNELogger,
  ApplyType,
  GlobalExceptionFilter,
  JobQueue,
} from '../../base';
import { AuthService } from '../../core/auth';
import { Mailer } from '../../core/mail';
import { UserModel } from '../../models';
import {
  createFactory,
  MockedUser,
  MockJobQueue,
  MockUser,
  MockUserInput,
} from '../mocks';
import { MockMailer } from '../mocks/mailer.mock';
import { createTestingModule } from './testing-module';
import { initTestingDB, TEST_LOG_LEVEL } from './utils';

interface TestingAppMetadata extends ModuleMetadata {
  tapModule?(m: TestingModuleBuilder): void;
  tapApp?(app: INestApplication): void;
}

export type TestUser = Omit<User, 'password'> & { password: string };

const OneMB = 1024 * 1024;

export async function createTestingApp(
  moduleDef: TestingAppMetadata = {}
): Promise<TestingApp> {
  const module = await createTestingModule(moduleDef, false);
  const logger = new AFFiNELogger();
  logger.setLogLevels([TEST_LOG_LEVEL]);

  const app = module.createNestApplication<NestExpressApplication>({
    cors: true,
    bodyParser: true,
    rawBody: true,
    logger,
  });

  app.useBodyParser('raw', { limit: 1 * OneMB });
  app.useGlobalFilters(new GlobalExceptionFilter(app.getHttpAdapter()));
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * OneMB,
      maxFiles: 5,
    })
  );

  app.use(cookieParser());

  if (moduleDef.tapApp) {
    moduleDef.tapApp(app);
  }

  await module.initTestingDB();
  await app.init();

  return makeTestingApp(app);
}

export function parseCookies(res: supertest.Response) {
  const cookies = res.get('Set-Cookie') ?? [];
  const sessionCookie = cookies.reduce(
    (cookies, cookie) => {
      const [key, value] = cookie.split(';')[0].split('=');
      cookies[key] = value;
      return cookies;
    },
    {} as Record<string, string>
  );

  return sessionCookie;
}

export class TestingApp extends ApplyType<INestApplication>() {
  private sessionCookie: string | null = null;
  private currentUserCookie: string | null = null;
  private readonly userCookies: Set<string> = new Set();

  readonly create!: ReturnType<typeof createFactory>;
  readonly mails!: MockMailer;
  readonly queue!: MockJobQueue;

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  async initTestingDB() {
    await initTestingDB(this);
    this.sessionCookie = null;
    this.currentUserCookie = null;
    this.userCookies.clear();
  }

  url() {
    const server = this.getHttpServer();
    if (!server.address()) {
      server.listen();
    }
    return `http://localhost:${server.address().port}`;
  }

  request(
    method: 'options' | 'get' | 'post' | 'put' | 'delete' | 'patch',
    path: string
  ): supertest.Test {
    return supertest(this.getHttpServer())
      [method](path)
      .set('Cookie', [
        `${AuthService.sessionCookieName}=${this.sessionCookie ?? ''}`,
        `${AuthService.userCookieName}=${this.currentUserCookie ?? ''}`,
      ]);
  }

  OPTIONS(path: string): supertest.Test {
    return this.request('options', path);
  }

  GET(path: string): supertest.Test {
    return this.request('get', path);
  }

  POST(path: string): supertest.Test {
    return this.request('post', path).on(
      'response',
      (res: supertest.Response) => {
        const cookies = parseCookies(res);

        if (AuthService.sessionCookieName in cookies) {
          if (this.sessionCookie !== cookies[AuthService.sessionCookieName]) {
            this.userCookies.clear();
          }

          this.sessionCookie = cookies[AuthService.sessionCookieName];
          this.currentUserCookie = cookies[AuthService.userCookieName];
          if (this.currentUserCookie) {
            this.userCookies.add(this.currentUserCookie);
          }
        }
        return res;
      }
    );
  }

  PUT(path: string): supertest.Test {
    return this.request('put', path);
  }

  DELETE(path: string): supertest.Test {
    return this.request('delete', path);
  }

  PATCH(path: string): supertest.Test {
    return this.request('patch', path);
  }

  // TODO(@forehalo): directly make proxy for graphql queries defined in `@affine/graphql`
  // by calling with `app.apis.createWorkspace({ ...variables })`
  async gql<Data = any>(query: string, variables?: any): Promise<Data> {
    const res = await this.POST('/graphql')
      .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
      .send({
        query,
        variables,
      });

    if (res.status !== 200) {
      throw new Error(
        `Failed to execute gql: ${query}, status: ${res.status}, body: ${JSON.stringify(
          res.body,
          null,
          2
        )}`
      );
    }

    if (res.body.errors?.length) {
      if (TEST_LOG_LEVEL !== 'fatal') {
        // print the error stack when log level is not fatal, for better debugging
        console.error('%o', res.body);
      }
      throw new Error(res.body.errors[0].message);
    }

    return res.body.data;
  }

  private randomEmail() {
    return `test-${randomUUID()}@affine.pro`;
  }

  /**
   * @deprecated use `create(MockUser)`
   */
  async createUser(
    email?: string,
    override?: Partial<User>
  ): Promise<TestUser> {
    const model = this.get(UserModel);
    // TODO(@forehalo): model factories
    //   TestingData.user.create()
    const user = await model.create({
      email: email ?? this.randomEmail(),
      password: '1',
      name: email,
      emailVerifiedAt: new Date(),
      ...override,
    });

    // returned password is not encrypted
    user.password = '1';

    return user as Omit<User, 'password'> & { password: string };
  }

  /**
   * @deprecated use `signup`
   */
  async signupV1(email?: string, override?: Partial<User>) {
    const user = await this.createUser(email ?? this.randomEmail(), override);
    await this.login(user);
    return user;
  }

  async signup(overrides?: Partial<MockUserInput>) {
    const user = await this.create(MockUser, overrides);
    await this.login(user);
    return user;
  }

  async login(user: MockedUser) {
    await this.POST('/api/auth/sign-in')
      .send({
        email: user.email,
        password: user.password,
      })
      .expect(200);
  }

  async switchUser(userOrId: string | { id: string }) {
    if (!this.sessionCookie) {
      throw new Error('No user is logged in.');
    }

    const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;

    if (userId === this.currentUserCookie) {
      return;
    }

    if (this.userCookies.has(userId)) {
      this.currentUserCookie = userId;
    } else {
      throw new Error(`User [${userId}] is not logged in.`);
    }
  }

  async logout(userId?: string) {
    const res = await this.GET(
      '/api/auth/sign-out' + (userId ? `?user_id=${userId}` : '')
    ).expect(200);
    const cookies = parseCookies(res);
    this.sessionCookie = cookies[AuthService.sessionCookieName];
    if (!this.sessionCookie) {
      this.currentUserCookie = null;
      this.userCookies.clear();
    } else {
      this.currentUserCookie = cookies[AuthService.userCookieName];
      if (userId) {
        this.userCookies.delete(userId);
      }
    }
  }
}

function makeTestingApp(app: INestApplication): TestingApp {
  const testingApp = new TestingApp();

  // @ts-expect-error allow
  testingApp.create = createFactory(app.get(PrismaClient, { strict: false }));
  // @ts-expect-error allow
  testingApp.mails = app.get(Mailer, { strict: false }) as MockMailer;
  // @ts-expect-error allow
  testingApp.queue = app.get(JobQueue, { strict: false }) as MockJobQueue;

  return new Proxy(testingApp, {
    get(target, prop) {
      // @ts-expect-error override
      return target[prop] ?? app[prop];
    },
  });
}
