import { DebugLogger } from '@affine/debug';

import { MANUALLY_STOP, throwIfAborted } from '../../utils';
import type { Job, JobQueue } from './queue';

const logger = new DebugLogger('job-runner');

export class JobRunner<J> {
  abort: AbortController | null = null;

  constructor(
    private readonly queue: JobQueue<J>,
    private readonly worker: (
      jobs: Job<J>[],
      signal: AbortSignal
    ) => Promise<void>,
    private readonly interval: () => Promise<void> = async () => {}
  ) {}

  start() {
    this.stop();
    this.abort = new AbortController();
    this.loop(this.abort.signal).catch(err => {
      if (err === MANUALLY_STOP) {
        return;
      }
      logger.error(err);
    });
  }

  stop() {
    this.abort?.abort(MANUALLY_STOP);
    this.abort = null;
  }

  async loop(signal: AbortSignal) {
    while (throwIfAborted(signal)) {
      const jobs = await this.queue.waitForAccept(signal);

      if (jobs !== null) {
        try {
          await this.worker(jobs, signal);
          await this.queue.return(jobs);
        } catch (err) {
          if (err === MANUALLY_STOP) {
            await this.queue.return(jobs, true);
          } else {
            // TODO: retry logic
            await this.queue.return(jobs);
          }
          logger.error('Error processing jobs', err);
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await this.interval();
    }
  }
}
