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

const removableJobStates = [
  'waiting',
  'delayed',
  'prioritized',
  'paused',
  'waiting-children',
] as const;
const removeWhereBatchSize = 100;

function normalizeJobId(jobId: string) {
  return encodeURIComponent(jobId);
}

function normalizedJobIds(jobId: string) {
  const normalized = normalizeJobId(jobId);
  if (jobId.includes(':')) {
    return [normalized];
  }

  return normalized === jobId ? [jobId] : [jobId, normalized];
}

@Injectable()
export class JobQueue {
  private readonly logger = new Logger(JobQueue.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async add<T extends JobName>(name: T, payload: Jobs[T], opts?: JobsOptions) {
    const ns = namespace(name);
    const queue = this.getQueue(ns);
    const normalizedOpts = opts?.jobId
      ? { ...opts, jobId: normalizeJobId(opts.jobId) }
      : opts;
    const job = await queue.add(
      name,
      {
        $$requestId:
          ClsServiceManager.getClsService().getId() ?? genRequestId('job'),
        payload,
      } as JobData<T>,
      normalizedOpts
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
    const job = await this.get(jobId, jobName);

    if (!job) {
      return;
    }

    if (!job.id) return;
    const removed = await queue.remove(job.id);
    if (removed) {
      this.logger.log(`Job ${jobName}(id=${job.id}) removed from queue ${ns}`);
      return job.data.payload;
    }

    return undefined;
  }

  async removeWhere<T extends JobName>(
    jobName: T,
    predicate: (payload: Jobs[T]) => boolean | Promise<boolean>
  ): Promise<Jobs[T][]> {
    const ns = namespace(jobName);
    const queue = this.getQueue(ns);
    const removed: Jobs[T][] = [];

    for (const state of removableJobStates) {
      let start = 0;
      let removedFromBatch = false;
      let hasMoreJobs = true;

      while (hasMoreJobs) {
        removedFromBatch = false;
        const jobs = (await queue.getJobs(
          [state],
          start,
          start + removeWhereBatchSize - 1
        )) as Job<JobData<T>>[];

        if (!jobs.length) {
          hasMoreJobs = false;
          break;
        }

        for (const job of jobs) {
          if (job.name !== jobName) {
            continue;
          }

          const payload = job.data.payload;
          if (!(await predicate(payload))) {
            continue;
          }

          await job.remove();
          this.logger.log(
            `Job ${jobName}(id=${job.id}) removed from queue ${ns}`
          );
          removed.push(payload);
          removedFromBatch = true;
        }

        if (!removedFromBatch) {
          start += removeWhereBatchSize;
        }
      }
    }

    return removed;
  }

  async get<T extends JobName>(jobId: string, jobName: T) {
    const ns = namespace(jobName);
    const queue = this.getQueue(ns);
    for (const id of normalizedJobIds(jobId)) {
      const job = (await queue.getJob(id)) as Job<JobData<T>> | undefined;
      if (job) {
        return job;
      }
    }

    return undefined;
  }

  private getQueue(ns: string): Queue {
    return this.moduleRef.get(getQueueToken(ns), { strict: false });
  }
}
