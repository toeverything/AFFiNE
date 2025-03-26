import { getQueueToken } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Job, JobsOptions, Queue } from 'bullmq';

import { namespace } from './def';

@Injectable()
export class JobQueue {
  private readonly logger = new Logger(JobQueue.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async add<T extends JobName>(name: T, payload: Jobs[T], opts?: JobsOptions) {
    const ns = namespace(name);
    const queue = this.getQueue(ns);
    const job = await queue.add(name, payload, opts);
    this.logger.log(`Job [${name}] added; id=${job.id}`);
    return job;
  }

  async remove<T extends JobName>(jobId: string, jobName: T) {
    const ns = namespace(jobName);
    const queue = this.getQueue(ns);
    const job = (await queue.getJob(jobId)) as Job<Jobs[T]> | undefined;

    if (!job) {
      return;
    }

    const removed = await queue.remove(jobId);
    if (removed) {
      this.logger.log(`Job ${jobName} removed from queue ${ns}`);
      return job.data;
    }

    return undefined;
  }

  private getQueue(ns: string): Queue {
    return this.moduleRef.get(getQueueToken(ns), { strict: false });
  }
}
