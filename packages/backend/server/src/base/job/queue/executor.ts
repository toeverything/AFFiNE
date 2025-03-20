import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { difference } from 'lodash-es';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';

import { Config } from '../../config';
import { metrics, wrapCallMetric } from '../../metrics';
import { QueueRedis } from '../../redis';
import { Runtime } from '../../runtime';
import { genRequestId } from '../../utils';
import { JOB_SIGNAL, namespace, Queue, QUEUES } from './def';
import { JobHandlerScanner } from './scanner';

@Injectable()
export class JobExecutor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('job');
  private readonly workers: Record<string, Worker> = {};

  constructor(
    private readonly config: Config,
    private readonly redis: QueueRedis,
    private readonly scanner: JobHandlerScanner,
    private readonly runtime: Runtime
  ) {}

  async onApplicationBootstrap() {
    const queues = this.config.flavor.graphql
      ? difference(QUEUES, [Queue.DOC])
      : [];

    // NOTE(@forehalo): only enable doc queue in doc service
    if (this.config.flavor.doc) {
      queues.push(Queue.DOC);
    }

    await this.startWorkers(queues);
  }

  async onApplicationShutdown() {
    await this.stopWorkers();
  }

  async run(name: JobName, payload: any) {
    const ns = namespace(name);
    const handler = this.scanner.getHandler(name);

    if (!handler) {
      this.logger.warn(`Job handler for [${name}] not found.`);
      return;
    }

    const fn = wrapCallMetric(
      async () => {
        const cls = ClsServiceManager.getClsService();
        await cls.run({ ifNested: 'reuse' }, async () => {
          const requestId = cls.getId();
          if (!requestId) {
            cls.set(CLS_ID, genRequestId('job'));
          }

          const signature = `[${name}] (${handler.name})`;
          try {
            this.logger.debug(`Job started: ${signature}`);
            const result = await handler.fn(payload);

            if (result === JOB_SIGNAL.RETRY) {
              throw new Error(`Manually job retry`);
            }

            this.logger.debug(`Job finished: ${signature}`);
          } catch (e) {
            this.logger.error(`Job failed: ${signature}`, e);
            throw e;
          }
        });
      },
      'queue',
      'job_handler',
      {
        job: name,
        namespace: ns,
        handler: handler.name,
      }
    );
    const activeJobs = metrics.queue.counter('active_jobs');
    activeJobs.add(1, { queue: ns });
    try {
      await fn();
    } finally {
      activeJobs.add(-1, { queue: ns });
    }
  }

  private async startWorkers(queues: Queue[]) {
    const configs =
      (await this.runtime.fetchAll(
        queues.reduce(
          (ret, queue) => {
            ret[`job/queues.${queue}.concurrency`] = true;
            return ret;
          },
          {} as {
            [key in `job/queues.${Queue}.concurrency`]: true;
          }
        )
        // TODO(@forehalo): fix the override by [payment/service.spec.ts]
      )) ?? {};

    for (const queue of queues) {
      const concurrency =
        (configs[`job/queues.${queue}.concurrency`] as number) ??
        this.config.job.worker.concurrency ??
        1;

      const worker = new Worker(
        queue,
        async job => {
          await this.run(job.name as JobName, job.data);
        },
        {
          ...this.config.job.queue,
          ...this.config.job.worker,
          connection: this.redis,
          concurrency,
        }
      );

      worker.on('error', error => {
        this.logger.error(`Queue Worker [${queue}] error`, error);
      });

      this.logger.log(
        `Queue Worker [${queue}] started; concurrency=${concurrency};`
      );

      this.workers[queue] = worker;
    }
  }

  private async stopWorkers() {
    await Promise.all(
      Object.values(this.workers).map(async worker => {
        await worker.close(true);
      })
    );
  }
}
