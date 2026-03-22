import { interval, map, take, takeUntil } from 'rxjs';
import Sinon from 'sinon';

export class MockJobQueue {
  private readonly jobs = new Map<
    string,
    { name: JobName; payload: Jobs[JobName] }
  >();
  add = Sinon.stub().callsFake(
    async <Job extends JobName>(
      name: Job,
      payload: Jobs[Job],
      opts?: { jobId?: string }
    ) => {
      if (opts?.jobId && this.jobs.has(opts.jobId)) {
        return { id: opts.jobId, name };
      }

      if (opts?.jobId) {
        this.jobs.set(opts.jobId, { name, payload });
      }

      return { id: opts?.jobId, name };
    }
  );

  get = Sinon.stub().callsFake(
    async <Job extends JobName>(jobId: string, name: Job) => {
      const job = this.jobs.get(jobId);
      if (!job || job.name !== name) {
        return undefined;
      }

      return {
        id: jobId,
        name: job.name,
        data: {
          payload: job.payload,
        },
      };
    }
  );

  remove = Sinon.stub().callsFake(async (jobId: string) => {
    this.jobs.delete(jobId);
    return undefined;
  });

  last<Job extends JobName>(name: Job): { name: Job; payload: Jobs[Job] } {
    const addJobName = this.add.lastCall?.args[0];
    const payload = this.add.lastCall?.args[1];

    if (!payload) {
      throw new Error('No job ever added');
    }

    if (addJobName !== name) {
      throw new Error(`Job name mismatch: ${addJobName} !== ${name}`);
    }

    return { name, payload };
  }

  waitFor<Job extends JobName>(name: Job, timeout: number = 1000) {
    const { promise, reject, resolve } = Promise.withResolvers<{
      name: Job;
      payload: Jobs[Job];
    }>();

    interval(10)
      .pipe(
        take(Math.floor(timeout / 10)),
        takeUntil(promise),
        map(() => {
          const addJobName = this.add.lastCall?.args[0];
          const payload = this.add.lastCall?.args[1];
          return addJobName === name ? payload : undefined;
        })
      )
      .subscribe({
        next: val => {
          if (val) {
            resolve({ name, payload: val });
          }
        },
        complete: () => {
          reject(new Error('Timeout wait for job coming'));
        },
      });

    return promise;
  }

  count(name: JobName) {
    return this.add
      .getCalls()
      .filter((call: Sinon.SinonSpyCall) => call.args[0] === name).length;
  }
}
