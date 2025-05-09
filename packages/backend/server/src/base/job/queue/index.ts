import './config';

import { BullModule } from '@nestjs/bullmq';
import { DynamicModule } from '@nestjs/common';
import { type QueueOptions } from 'bullmq';

import { Config } from '../../config';
import { QueueRedis } from '../../redis';
import { Queue, QUEUES } from './def';
import { JobExecutor } from './executor';
import { JobQueue } from './queue';
import { JobHandlerScanner } from './scanner';

export class JobModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      module: JobModule,
      imports: [
        BullModule.forRootAsync({
          useFactory: (config: Config, redis: QueueRedis): QueueOptions => {
            let prefix = 'affine_job';
            if (env.testing) {
              prefix += '_test';
            } else if (!env.namespaces.production) {
              prefix += '_' + env.NAMESPACE;
            }
            return {
              // NOTE(@forehalo):
              //   we distinguish jobs by namespace,
              //   to avoid new jobs been dropped by old deployments
              prefix,
              defaultJobOptions: config.job.queue,
              connection: redis,
            };
          },
          inject: [Config, QueueRedis],
        }),
        BullModule.registerQueue(
          ...QUEUES.map(name => {
            if (name === Queue.NIGHTLY_JOB) {
              // avoid nightly jobs been run multiple times
              return { name, removeOnComplete: { age: 1000 * 60 * 60 } };
            }
            return { name };
          })
        ),
      ],
      providers: [JobQueue, JobExecutor, JobHandlerScanner],
      exports: [JobQueue],
    };
  }
}

export { JobQueue };
export { JOB_SIGNAL, OnJob } from './def';
