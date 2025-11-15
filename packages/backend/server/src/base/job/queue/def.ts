import { join } from 'node:path';

import { PushMetadata, sliceMetadata } from '../../nestjs';

declare global {
  /**
   * Job definitions can be extended by
   *
   * @example
   *
   * declare global {
   *   interface Jobs {
   *     'nightly.deleteExpiredUserSessions': {}
   *      ^^^^^^^ first segment must be namespace and a standalone queue will be created for each namespace
   *   }
   * }
   */
  interface Jobs {}

  type JobName = keyof Jobs;
}

export const JOB_METADATA = Symbol('JOB');

export enum Queue {
  NIGHTLY_JOB = 'nightly',
  NOTIFICATION = 'notification',
  DOC = 'doc',
  COPILOT = 'copilot',
  INDEXER = 'indexer',
}

export const QUEUES = Object.values(Queue);

export function namespace(job: JobName) {
  const parts = job.split('.');

  // no namespace
  if (parts.length === 1) {
    throw new Error(
      `Job name must contain at least one namespace like [namespace].[job], get [${job}].`
    );
  }

  return parts[0];
}

export const OnJob = (job: JobName) => {
  const ns = namespace(job);
  if (!QUEUES.includes(ns as Queue)) {
    throw new Error(
      `Invalid job queue: ${ns}, must be one of [${QUEUES.join(', ')}].
If you want to introduce new job queue, please modify the Queue enum first in ${join(env.projectRoot, 'src/base/job/queue/def.ts')}`
    );
  }

  if (job === ns) {
    throw new Error("The job name must not be the same as it's namespace.");
  }

  return PushMetadata(JOB_METADATA, job);
};

export function getJobHandlerMetadata(target: any): JobName[] {
  return sliceMetadata<JobName>(JOB_METADATA, target);
}

export enum JOB_SIGNAL {
  Retry = 'retry',
  Repeat = 'repeat',
  Done = 'done',
}
