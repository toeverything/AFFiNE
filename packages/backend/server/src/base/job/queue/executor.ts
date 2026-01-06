import { getQueueToken, getSharedConfigToken } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Job, Queue as Bullmq, Worker, WorkerOptions } from 'bullmq';
import { difference, merge } from 'lodash-es';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';

import { Config } from '../../config';
import { OnEvent } from '../../event';
import { metrics, wrapCallMetric } from '../../metrics';
import { QueueRedis } from '../../redis';
import { genRequestId } from '../../utils';
import { JOB_SIGNAL, namespace, Queue, QUEUES } from './def';
import { JobHandlerScanner } from './scanner';

@Injectable()
export class JobExecutor implements OnModuleDestroy {
  private readonly logger = new Logger('job');
  private readonly workers: Map<Queue, Worker> = new Map();

  constructor(
    private readonly config: Config,
    private readonly redis: QueueRedis,
    private readonly scanner: JobHandlerScanner,
    private readonly ref: ModuleRef
  ) {}

  @OnEvent('config.init')
  async onConfigInit() {
    const queues = env.flavors.graphql
      ? difference(QUEUES, [Queue.DOC, Queue.INDEXER])
      : [];

    // NOTE(@forehalo): only enable doc queue in doc service
    if (env.flavors.doc) {
      queues.push(Queue.DOC);
      // NOTE(@fengmk2): Once the index task cannot be processed in time, it needs to be separated from the doc service and deployed independently.
      queues.push(Queue.INDEXER);
    }

    await this.startWorkers(queues);
  }

  @OnEvent('config.changed')
  async onConfigChanged({ updates }: Events['config.changed']) {
    if (updates.job?.queues) {
      Object.entries(updates.job.queues).forEach(([queue, options]) => {
        if (options.concurrency) {
          this.setConcurrency(queue as Queue, options.concurrency);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.stopWorkers();
  }

  async run<T extends JobName>(
    name: T,
    payload: Jobs[T],
    jobId?: string
  ): Promise<JOB_SIGNAL | undefined> {
    const ns = namespace(name);
    const handler = this.scanner.getHandler(name);

    if (!handler) {
      this.logger.warn(`Job handler for [${name}] not found.`);
      return;
    }

    const fn = wrapCallMetric(
      async () => {
        const signature = `[${name}] (${handler.name}, id=${jobId})`;
        try {
          const ts = Date.now();
          this.logger.verbose(`Job started: ${signature}`, payload);
          const ret = await handler.fn(payload);
          this.logger.verbose(`Job finished: ${signature}`, {
            signature,
            signal: ret,
            cost: Date.now() - ts,
          });
          return ret;
        } catch (e) {
          this.logger.error(`Job failed: ${signature}`, e);
          throw e;
        }
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
      return await fn();
    } finally {
      activeJobs.add(-1, { queue: ns });
    }
  }

  setConcurrency(queue: Queue, concurrency: number) {
    const worker = this.workers.get(queue);
    if (!worker) {
      throw new Error(`Worker for [${queue}] not found.`);
    }

    worker.concurrency = concurrency;
  }

  private async startWorkers(queues: Queue[]) {
    for (const queue of queues) {
      const queueOptions = this.config.job.queues[queue];
      const concurrency = queueOptions.concurrency ?? 1;

      const worker = new Worker(
        queue,
        async job => {
          const cls = ClsServiceManager.getClsService();
          let payload: any;
          let requestId: string;

          if (job.data.$$requestId) {
            requestId = job.data.$$requestId;
            payload = job.data.payload;
          } else {
            requestId = genRequestId('job');
            payload = job.data;
          }

          return await cls.run(async () => {
            cls.set(CLS_ID, requestId);
            return await this.run(job.name as JobName, payload, job.id);
          });
        },
        merge({}, this.config.job.queue, this.config.job.worker, queueOptions, {
          prefix: this.ref.get(getSharedConfigToken(), { strict: false })
            .prefix,
          concurrency,
          connection: this.redis,
        } as WorkerOptions)
      );

      worker.on('error', error => {
        this.logger.error(`Queue Worker [${queue}] error`, error);
      });

      worker.on('completed', (job, result) => {
        this.handleJobReturn(job, result).catch(() => {
          /* noop */
        });
      });

      this.logger.log(
        `Queue Worker [${queue}] started; concurrency=${concurrency};`
      );

      this.workers.set(queue, worker);
    }
  }

  async handleJobReturn(job: Job, result: JOB_SIGNAL) {
    if (result === JOB_SIGNAL.Repeat || result === JOB_SIGNAL.Retry) {
      try {
        await this.getQueue(namespace(job.name as JobName)).add(
          job.name,
          job.data,
          job.opts
        );
        this.logger.debug(`Added job [${job.name}] to queue, signal=${result}`);
      } catch (e) {
        this.logger.error(`Failed to add job [${job.name}]`, e);
      }
    }
  }

  private async stopWorkers() {
    await Promise.all(
      Array.from(this.workers.values()).map(async worker => {
        await worker.close(true);
      })
    );
  }

  private getQueue(ns: string): Bullmq {
    return this.ref.get(getQueueToken(ns), { strict: false });
  }
}
