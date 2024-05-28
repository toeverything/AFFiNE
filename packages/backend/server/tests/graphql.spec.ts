import {
  ForbiddenException,
  HttpStatus,
  INestApplication,
} from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import testFn, { TestFn } from 'ava';
import request from 'supertest';

import { Public } from '../src/core/auth';
import { createTestingApp } from './utils';

@Public()
@Resolver(() => String)
class TestResolver {
  greating = 'hello world';

  @Query(() => String)
  hello() {
    return this.greating;
  }

  @Mutation(() => String)
  update(@Args('greating') greating: string) {
    this.greating = greating;
    return this.greating;
  }

  @Query(() => String)
  errorQuery() {
    throw new ForbiddenException('forbidden query');
  }

  @Query(() => String)
  unknownErrorQuery() {
    throw new Error('unknown error');
  }
}

const test = testFn as TestFn<{ app: INestApplication }>;

function gql(app: INestApplication, query: string) {
  return request(app.getHttpServer())
    .post('/graphql')
    .send({ query })
    .expect(200);
}

test.beforeEach(async ctx => {
  const { app } = await createTestingApp({
    providers: [TestResolver],
  });

  ctx.context.app = app;
});

test.afterEach.always(async ctx => {
  await ctx.context.app.close();
});

test('should be able to execute query', async t => {
  const res = await gql(t.context.app, `query { hello }`);
  t.is(res.body.data.hello, 'hello world');
});

test('should be able to execute mutation', async t => {
  const res = await gql(t.context.app, `mutation { update(greating: "hi") }`);

  t.is(res.body.data.update, 'hi');

  const newRes = await gql(t.context.app, `query { hello }`);
  t.is(newRes.body.data.hello, 'hi');
});

test('should be able to handle known http exception', async t => {
  const res = await gql(t.context.app, `query { errorQuery }`);
  const err = res.body.errors[0];
  t.is(err.message, 'forbidden query');
  t.is(err.extensions.code, HttpStatus.FORBIDDEN);
  t.is(err.extensions.status, HttpStatus[HttpStatus.FORBIDDEN]);
});

test('should be able to handle unknown internal error', async t => {
  const res = await gql(t.context.app, `query { unknownErrorQuery }`);
  const err = res.body.errors[0];
  t.is(err.message, 'Internal Server Error');
  t.is(err.extensions.code, HttpStatus.INTERNAL_SERVER_ERROR);
  t.is(err.extensions.status, HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR]);
});
