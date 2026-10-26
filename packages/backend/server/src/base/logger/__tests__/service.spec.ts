import { PassThrough } from 'node:stream';
import { mock } from 'node:test';

import { TestingModule } from '@nestjs/testing';
import ava, { TestFn } from 'ava';
import { createLogger, format, transports } from 'winston';

import { createTestingModule } from '../../../__tests__/utils';
import { AFFiNELogger as CloudLogger } from '../../../plugins/gcloud/logging/logger';
import { AFFiNELogger } from '../service';

export const test = ava as TestFn<{
  module: TestingModule;
  logger: AFFiNELogger;
}>;

test.before(async t => {
  const m = await createTestingModule({
    providers: [AFFiNELogger],
  });
  const logger = m.get(AFFiNELogger);
  t.context.module = m;
  t.context.logger = logger;
});

test.afterEach(() => {
  mock.reset();
});

test.after(async t => {
  await t.context.module.close();
});

test('should auto print error stack when stack argument is an error instance', t => {
  const logger = t.context.logger;
  const error = new Error('test error');
  // @ts-expect-error private method
  const fake = mock.method(logger, 'printMessages', () => {
    return;
  });
  logger.error('test message', error);
  t.is(fake.mock.callCount(), 1);
  const printStackTraceArgs: any = fake.mock.calls[0].arguments[0];
  t.is(printStackTraceArgs[0], 'test message');
  t.is(printStackTraceArgs[1], error.stack);
});

test('should auto print error stack when stack argument is a string', t => {
  const logger = t.context.logger;
  const error = new Error('test error');
  // @ts-expect-error private method
  const fake = mock.method(logger, 'printMessages', () => {
    return;
  });
  logger.error('test message', error.stack);
  t.is(fake.mock.callCount(), 1);
  const printStackTraceArgs: any = fake.mock.calls[0].arguments[0];
  t.is(printStackTraceArgs[0], 'test message');
  t.is(printStackTraceArgs[1], error.stack);
});

test('should print error stack with cause', t => {
  const logger = t.context.logger;
  const error = new Error('test error');
  error.cause = new Error('cause error');
  // @ts-expect-error private method
  const fake = mock.method(logger, 'printMessages', () => {
    return;
  });
  logger.error('test message', error);
  t.is(fake.mock.callCount(), 1);
  const printStackTraceArgs: any = fake.mock.calls[0].arguments[0];
  t.is(printStackTraceArgs[0], 'test message');
  t.is(
    printStackTraceArgs[1],
    `${error.stack}\n\nCaused by:\n\n${(error.cause as any).stack}`
  );
});

test('cloud logger emits structured context and error causes in one record', t => {
  const output = new PassThrough();
  let json = '';
  output.on('data', chunk => {
    json += chunk.toString();
  });
  const raw = createLogger({
    format: format.json(),
    transports: [new transports.Stream({ stream: output })],
  });
  const logger = new CloudLogger(raw);
  const cause = new Error('source missing');
  const error = new Error('write failed', { cause });
  logger.error(
    'Failed to insert doc updates',
    {
      workspaceId: 'workspace',
      docId: 'doc',
      writeIntent: 'create_doc',
      error,
    },
    'DocStorage'
  );
  const record = JSON.parse(json);
  t.like(record, {
    message: 'Failed to insert doc updates',
    workspaceId: 'workspace',
    docId: 'doc',
    writeIntent: 'create_doc',
    context: 'DocStorage',
  });
  t.is(record.stack[0], `${error.stack}\n\nCaused by:\n\n${cause.stack}`);
  raw.close();
  output.destroy();
});
