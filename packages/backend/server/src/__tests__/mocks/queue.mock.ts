import Sinon from 'sinon';

import { JobQueue } from '../../base';

export class MockJobQueue {
  add = Sinon.createStubInstance(JobQueue).add.resolves();

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

  count(name: JobName) {
    return this.add.getCalls().filter(call => call.args[0] === name).length;
  }
}
