import assert from 'node:assert/strict';

import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpStatus,
  INestApplication,
  Logger,
  LoggerService,
  Post,
} from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  MessageBody,
  SubscribeMessage as RawSubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import testFn, { TestFn } from 'ava';
import Sinon from 'sinon';
import request from 'supertest';
import { z } from 'zod';

import {
  AccessDenied,
  GatewayErrorWrapper,
  UserFriendlyError,
} from '../../base';
import { Public } from '../../core/auth';
import { EmailSchema } from '../../models/common/schema';
import { createTestingApp } from '../utils';

const TestSchema = z.object({
  email: EmailSchema,
  foo: z.string().trim().min(1).optional(),
});

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

  @Mutation(() => String)
  validate(@Args('email') email: string) {
    const input = TestSchema.parse({ email });
    return input.email;
  }

  @Query(() => String)
  errorQuery() {
    throw new AccessDenied();
  }

  @Query(() => String)
  unknownErrorQuery() {
    throw new Error('unknown error');
  }
}

@Public()
@Controller('/')
class TestController {
  @Get('/ok')
  ok() {
    return 'ok';
  }

  @Get('/throw-known-error')
  throwKnownError() {
    throw new AccessDenied();
  }

  @Get('/throw-unknown-error')
  throwUnknownError() {
    throw new Error('Unknown error');
  }

  @Post('/validate')
  validate(@Body() body: { email: string }) {
    const input = TestSchema.parse(body);
    return input;
  }
}

const SubscribeMessage = (event: string) =>
  applyDecorators(GatewayErrorWrapper(event), RawSubscribeMessage(event));

@WebSocketGateway({ transports: ['websocket'], path: '/ws' })
class TestGateway {
  @SubscribeMessage('event:ok')
  async ok() {
    return {
      data: 'ok',
    };
  }

  @SubscribeMessage('event:throw-known-error')
  async throwKnownError() {
    throw new AccessDenied();
  }

  @SubscribeMessage('event:throw-unknown-error')
  async throwUnknownError() {
    throw new Error('Unknown error');
  }

  @SubscribeMessage('event:validate')
  async validate(@MessageBody() body: { email: string }) {
    const input = TestSchema.parse(body);
    return input;
  }
}

const test = testFn as TestFn<{
  app: INestApplication;
  logger: Sinon.SinonStubbedInstance<LoggerService>;
}>;

function gql(app: INestApplication, query: string) {
  return request(app.getHttpServer())
    .post('/graphql')
    .send({ query })
    .expect(res => {
      assert(
        res.status === 200 || res.status === 400,
        'GraphQL query should return 200 or 400'
      );
    });
}

test.before(async ({ context }) => {
  const app = await createTestingApp({
    providers: [TestResolver, TestGateway],
    controllers: [TestController],
  });

  context.logger = Sinon.stub(new Logger().localInstance);
  context.app = app;
});

test.beforeEach(() => {
  Sinon.reset();
});

test.after.always(async ctx => {
  await ctx.context.app.close();
});

test('should be able to execute query', async t => {
  const res = await gql(t.context.app, `query { hello }`);
  t.is(res.body.data.hello, 'hello world');
});

test('should be able to handle known user error in graphql query', async t => {
  const res = await gql(t.context.app, `query { errorQuery }`);
  const err = res.body.errors[0];
  t.is(err.message, 'You do not have permission to access this resource.');
  t.is(err.extensions.status, HttpStatus.FORBIDDEN);
  t.is(err.extensions.name, 'ACCESS_DENIED');
  // console.log(t.context.logger.error.getCalls());
  t.true(t.context.logger.error.notCalled);
});

test('should be able to handle unknown internal error in graphql query', async t => {
  const res = await gql(t.context.app, `query { unknownErrorQuery }`);
  const err = res.body.errors[0];
  t.is(err.message, 'An internal error occurred.');
  t.is(err.extensions.status, HttpStatus.INTERNAL_SERVER_ERROR);
  t.is(err.extensions.name, 'INTERNAL_SERVER_ERROR');
  t.true(t.context.logger.error.calledOnceWith('internal_server_error'));
});

test('should be able to handle validation error in graphql query', async t => {
  const res = await gql(
    t.context.app,
    `mutation { validate(email: "invalid-email") }`
  );
  const err = res.body.errors[0];
  t.is(
    err.message,
    `Validation error, errors: [
  {
    "validation": "email",
    "code": "invalid_string",
    "message": "Invalid email",
    "path": [
      "email"
    ]
  }
]`
  );
  t.is(err.extensions.status, HttpStatus.BAD_REQUEST);
  t.is(err.extensions.name, 'VALIDATION_ERROR');
  t.true(t.context.logger.error.notCalled);
});

test('should be able to handle graphql input error', async t => {
  const res = await gql(t.context.app, `mutation { validate(email: 123) }`);
  const err = res.body.errors[0];
  t.is(err.message, 'String cannot represent a non string value: 123');
  t.is(err.extensions.status, HttpStatus.BAD_REQUEST);
  t.is(err.extensions.name, 'GRAPHQL_BAD_REQUEST');
  t.true(t.context.logger.error.notCalled);
});

test('should be able to respond request', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/ok')
    .expect(200);
  t.is(res.text, 'ok');
});

test('should be able to handle known user error in http request', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/throw-known-error')
    .expect(HttpStatus.FORBIDDEN);

  t.is(res.body.message, 'You do not have permission to access this resource.');
  t.is(res.body.name, 'ACCESS_DENIED');
  t.true(t.context.logger.error.notCalled);
});

test('should be able to handle unknown internal error in http request', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/throw-unknown-error')
    .expect(HttpStatus.INTERNAL_SERVER_ERROR);
  t.is(res.body.message, 'An internal error occurred.');
  t.is(res.body.name, 'INTERNAL_SERVER_ERROR');
  t.true(
    t.context.logger.error.calledOnceWith(
      `internal_server_error (${JSON.stringify({
        requestId: res.body.requestId,
      })})`
    )
  );
});

test('should be able to handle validation error in http request', async t => {
  const res = await request(t.context.app.getHttpServer())
    .post('/validate')
    .send({ email: 'invalid-email', foo: '' })
    .expect(HttpStatus.BAD_REQUEST);
  t.is(
    res.body.message,
    `Validation error, errors: [
  {
    "validation": "email",
    "code": "invalid_string",
    "message": "Invalid email",
    "path": [
      "email"
    ]
  },
  {
    "code": "too_small",
    "minimum": 1,
    "type": "string",
    "inclusive": true,
    "exact": false,
    "message": "String must contain at least 1 character(s)",
    "path": [
      "foo"
    ]
  }
]`
  );
  t.is(res.body.name, 'VALIDATION_ERROR');
  t.is(res.body.type, 'INVALID_INPUT');
  t.is(res.body.code, 'Bad Request');
  t.truthy(res.body.data.errors);
  t.true(t.context.logger.error.notCalled);
});

// Hard to test through websocket, will call event handler directly
test('should be able to response websocket event', async t => {
  const gateway = t.context.app.get(TestGateway);

  const res = await gateway.ok();
  t.is(res.data, 'ok');
});

test('should be able to handle known user error in websocket event', async t => {
  const gateway = t.context.app.get(TestGateway);

  const { error } = (await gateway.throwKnownError()) as unknown as {
    error: UserFriendlyError;
  };
  t.is(error.message, 'You do not have permission to access this resource.');
  t.is(error.name, 'ACCESS_DENIED');
  t.true(t.context.logger.error.notCalled);
});

test('should be able to handle unknown internal error in websocket event', async t => {
  const gateway = t.context.app.get(TestGateway);

  const { error } = (await gateway.throwUnknownError()) as unknown as {
    error: UserFriendlyError;
  };
  t.is(error.message, 'An internal error occurred.');
  t.is(error.name, 'INTERNAL_SERVER_ERROR');
  t.true(t.context.logger.error.calledOnceWith('internal_server_error'));
});

test('should be able to handle validation error in graphql mutation', async t => {
  const gateway = t.context.app.get(TestGateway);

  const { error } = (await gateway.validate({
    email: 'invalid-email',
  })) as unknown as {
    error: UserFriendlyError;
  };
  t.is(
    error.message,
    `Validation error, errors: [
  {
    "validation": "email",
    "code": "invalid_string",
    "message": "Invalid email",
    "path": [
      "email"
    ]
  }
]`
  );
  t.is(error.name, 'VALIDATION_ERROR');
  t.true(t.context.logger.error.notCalled);
});
