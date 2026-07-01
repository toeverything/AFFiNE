import { Global, Module } from '@nestjs/common';
import { interval, map, take, takeUntil } from 'rxjs';
import Sinon from 'sinon';

import { JobQueue } from '../../base';

export class MockJobQueue {
  private readonly sandbox = Sinon.createSandbox();

  add = this.sandbox.stub().resolves();
  get = this.sandbox.stub().resolves();
  remove = this.sandbox.stub().resolves();
  removeWhere = this.sandbox.stub().resolves([]);

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
    return this.add.getCalls().filter(call => call.args[0] === name).length;
  }
}

@Global()
@Module({
  providers: [{ provide: JobQueue, useClass: MockJobQueue }],
  exports: [JobQueue],
})
export class MockJobModule {}
