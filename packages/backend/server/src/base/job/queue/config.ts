import { QueueOptions, WorkerOptions } from 'bullmq';

import {
  defineRuntimeConfig,
  defineStartupConfig,
  ModuleConfig,
} from '../../config';
import { Queue } from './def';

declare module '../../config' {
  interface AppConfig {
    job: ModuleConfig<
      {
        queue: Omit<QueueOptions, 'connection'>;
        worker: Omit<WorkerOptions, 'connection'>;
      },
      {
        queues: {
          [key in Queue]: {
            concurrency: number;
          };
        };
      }
    >;
  }
}

defineStartupConfig('job', {
  queue: {
    prefix: AFFiNE.node.test ? 'affine_job_test' : 'affine_job',
    defaultJobOptions: {
      attempts: 5,
      // should remove job after it's completed, because we will add a new job with the same job id
      removeOnComplete: true,
      removeOnFail: {
        age: 24 * 3600 /* 1 day */,
        count: 500,
      },
    },
  },
  worker: {},
});

defineRuntimeConfig('job', {
  'queues.nightly.concurrency': {
    default: 1,
    desc: 'Concurrency of worker consuming of nightly checking job queue',
  },
  'queues.notification.concurrency': {
    default: 10,
    desc: 'Concurrency of worker consuming of notification job queue',
  },
  'queues.doc.concurrency': {
    default: 1,
    desc: 'Concurrency of worker consuming of doc job queue',
  },
  'queues.copilot.concurrency': {
    default: 1,
    desc: 'Concurrency of worker consuming of copilot job queue',
  },
});
