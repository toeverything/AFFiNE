import { Injectable } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import test from 'ava';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';
import Sinon from 'sinon';

import { createTestingModule } from '../../../../__tests__/utils';
import { ConfigModule } from '../../../config';
import { metrics } from '../../../metrics';
import { genRequestId } from '../../../utils';
import { JobModule, JobQueue, OnJob } from '..';
import { JobExecutor } from '../executor';
import { JobHandlerScanner } from '../scanner';

let module: TestingModule;
let queue: JobQueue;
let executor: JobExecutor;

declare global {
  interface Jobs {
    'nightly.__test__job': {
      name: string;
    };
    'nightly.__test__job2': {
      name: string;
    };
    'nightly.__test__throw': any;
    'nightly.__test__requestId': any;
  }
}

@Injectable()
class JobHandlers {
  @OnJob('nightly.__test__job')
  @OnJob('nightly.__test__job2')
  async handleJob(job: Jobs['nightly.__test__job']) {
    return job.name;
  }

  @OnJob('nightly.__test__throw')
  async throwJob() {
    throw new Error('Throw in job handler');
  }

  @OnJob('nightly.__test__requestId')
  onRequestId() {
    const cls = ClsServiceManager.getClsService();
    return cls.getId() ?? genRequestId('job');
  }
}

test.before(async () => {
  module = await createTestingModule({
    imports: [
      ConfigModule.forRoot({
        job: {
          worker: {
            // NOTE(@forehalo):
            //   bullmq will hold the connection to check stalled jobs,
            //   which will keep the test process alive to timeout.
            stalledInterval: 100,
          },
          queue: {
            defaultJobOptions: { delay: 1000 },
          },
        },
      }),
      JobModule.forRoot(),
    ],
    providers: [JobHandlers],
    tapModule: builder => {
      // use real JobQueue for testing
      builder.overrideProvider(JobQueue).useClass(JobQueue);
    },
  });

  queue = module.get(JobQueue);
  executor = module.get(JobExecutor);
});

test.afterEach(async () => {
  // @ts-expect-error private api
  const inner = queue.getQueue('nightly');
  await inner.obliterate({ force: true });
  inner.resume();
});

test.after.always(async () => {
  await module.close();
});

// #region scanner
test('should register job handler', async t => {
  const scanner = module.get(JobHandlerScanner);

  const handler = scanner.getHandler('nightly.__test__job');

  t.is(handler!.name, 'JobHandlers.handleJob');
  t.is(typeof handler!.fn, 'function');
});
// #endregion

// #region queue
test('should add job to queue', async t => {
  const job = await queue.add('nightly.__test__job', { name: 'test' });

  // @ts-expect-error private api
  const innerQueue = queue.getQueue('nightly');
  const queuedJob = await innerQueue.getJob(job.id!);

  t.is(queuedJob.name, job.name);
});

test('should remove job from queue', async t => {
  const job = await queue.add('nightly.__test__job', { name: 'test' });

  // @ts-expect-error private api
  const innerQueue = queue.getQueue('nightly');

  const data = await queue.remove(job.id!, job.name as JobName);

  t.deepEqual(data, { name: 'test' });

  const nullData = await queue.remove(job.id!, job.name as JobName);
  const nullJob = await innerQueue.getJob(job.id!);

  t.is(nullData, undefined);
  t.is(nullJob, undefined);
});
// #endregion

// #region executor
test('should start workers', async t => {
  // @ts-expect-error private api
  const worker = executor.workers['nightly'];

  t.truthy(worker);
  t.true(worker.isRunning());
});

test('should dispatch job handler', async t => {
  const handlers = module.get(JobHandlers);
  const spy = Sinon.spy(handlers, 'handleJob');

  await executor.run('nightly.__test__job', { name: 'test executor' });

  t.true(spy.calledOnceWithExactly({ name: 'test executor' }));
});

test('should be able to record job metrics', async t => {
  const counterStub = Sinon.stub(
    metrics.queue.counter('function_calls'),
    'add'
  );
  const timerStub = Sinon.stub(
    metrics.queue.histogram('function_timer'),
    'record'
  );

  await executor.run('nightly.__test__job', { name: 'test executor' });

  t.snapshot(counterStub.args, '[+1 active jobs, job handler, -1 active jobs]');
  t.deepEqual(timerStub.firstCall.args[1], {
    name: 'job_handler',
    job: 'nightly.__test__job',
    namespace: 'nightly',
    handler: 'JobHandlers.handleJob',
    error: false,
  });

  counterStub.reset();
  timerStub.reset();

  await executor.run('nightly.__test__job2', { name: 'test executor' });

  t.snapshot(counterStub.args, '[+1 active jobs, job handler, -1 active jobs]');
  t.deepEqual(timerStub.firstCall.args[1], {
    name: 'job_handler',
    job: 'nightly.__test__job2',
    namespace: 'nightly',
    handler: 'JobHandlers.handleJob',
    error: false,
  });

  counterStub.reset();
  timerStub.reset();

  await t.throwsAsync(
    executor.run('nightly.__test__throw', { name: 'test executor' }),
    {
      message: 'Throw in job handler',
    }
  );

  t.snapshot(
    counterStub.args,
    '[+1 active jobs, job handler errored, -1 active jobs]'
  );
  t.deepEqual(timerStub.firstCall.args[1], {
    name: 'job_handler',
    job: 'nightly.__test__throw',
    namespace: 'nightly',
    handler: 'JobHandlers.throwJob',
    error: true,
  });
});

test('should generate request id', async t => {
  const handlers = module.get(JobHandlers);
  const spy = Sinon.spy(handlers, 'onRequestId');

  await executor.run('nightly.__test__requestId', {});

  t.true(spy.returnValues.some(v => v.includes(':job:')));

  spy.restore();
});

test('should continuously use request id', async t => {
  const handlers = module.get(JobHandlers);
  const spy = Sinon.spy(handlers, 'onRequestId');

  const cls = ClsServiceManager.getClsService();
  await cls.run(async () => {
    cls.set(CLS_ID, 'test-request-id');
    await executor.run('nightly.__test__requestId', {});
  });
  t.true(spy.returned('test-request-id'));
  spy.restore();
});
// #endregion
