import { getQueueToken } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import test from 'ava';
import { Queue as Bullmq, Worker } from 'bullmq';
import Sinon from 'sinon';

import { createTestingModule } from '../../../../__tests__/utils';
import { ConfigModule } from '../../../config';
import { metrics } from '../../../metrics';
import { JobModule, JobQueue, OnJob } from '..';
import { JobExecutor } from '../executor';
import { JobHandlerScanner } from '../scanner';

let module: TestingModule;
let queue: JobQueue;
let executor: JobExecutor;
let worker: Worker;
let bullmq: Bullmq;

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
}

test.before(async () => {
  module = await createTestingModule({
    imports: [
      ConfigModule.override({
        job: {
          worker: {
            // NOTE(@forehalo):
            //   bullmq will hold the connection to check stalled jobs,
            //   which will keep the test process alive to timeout.
            stalledInterval: 100,
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
  bullmq = module.get(getQueueToken('nightly'), { strict: false });
  // @ts-expect-error private api
  worker = executor.workers.get('nightly')!;
  await worker.pause();
});

test.beforeEach(async () => {
  await bullmq.obliterate({ force: true });
  await bullmq.resume();
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

  const queuedJob = await queue.get(job.id!, job.name as JobName);

  t.is(queuedJob!.name, job.name);
});

test('should remove job from queue', async t => {
  const job = await queue.add('nightly.__test__job', { name: 'test' });

  const data = await queue.remove(job.id!, 'nightly.__test__job');

  t.deepEqual(data, { name: 'test' });

  const nullData = await queue.remove(job.id!, job.name as JobName);
  const nullJob = await bullmq.getJob(job.id!);

  t.is(nullData, undefined);
  t.is(nullJob, undefined);
});
// #endregion

// #region executor
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
    executor.run('nightly.__test__throw', { name: 'test executor' }, 'test-id'),
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
// #endregion
