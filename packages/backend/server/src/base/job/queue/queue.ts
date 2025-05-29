import { getQueueToken } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Job, JobsOptions, Queue } from 'bullmq';
import { ClsServiceManager } from 'nestjs-cls';

import { genRequestId } from '../../utils';
import { namespace } from './def';

interface JobData<T extends JobName> {
  $$requestId: string;
  payload: Jobs[T];
}

@Injectable()
export class JobQueue {
  private readonly logger = new Logger(JobQueue.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async add<T extends JobName>(name: T, payload: Jobs[T], opts?: JobsOptions) {
    const ns = namespace(name);
    const queue = this.getQueue(ns);
    const job = await queue.add(
      name,
      {
        $$requestId:
          ClsServiceManager.getClsService().getId() ?? genRequestId('job'),
        payload,
      } as JobData<T>,
      opts
    );
    this.logger.debug(`Job [${name}] added; id=${job.id}`);
    return job;
  }

  async remove<T extends JobName>(
    jobId: string,
    jobName: T
  ): Promise<Jobs[T] | undefined> {
    const ns = namespace(jobName);
    const queue = this.getQueue(ns);
    const job = (await queue.getJob(jobId)) as Job<JobData<T>> | undefined;

    if (!job) {
      return;
    }

    const removed = await queue.remove(jobId);
    if (removed) {
      this.logger.log(`Job ${jobName}(id=${jobId}) removed from queue ${ns}`);
      return job.data.payload;
    }

    return undefined;
  }

  async get<T extends JobName>(jobId: string, jobName: T) {
    const ns = namespace(jobName);
    const queue = this.getQueue(ns);
    return (await queue.getJob(jobId)) as Job<JobData<T>> | undefined;
  }

  private getQueue(ns: string): Queue {
    return this.moduleRef.get(getQueueToken(ns), { strict: false });
  }
}
