import { getWorkerUrl } from '@affine/env/worker';
import { OpClient, type OpSchema } from '@toeverything/infra/op';

type InitTask = () => Promise<unknown>;

export abstract class WorkerOpRenderer<
  Ops extends OpSchema,
> extends OpClient<Ops> {
  private readonly worker: Worker;
  private destroyed = false;
  private initPromise: Promise<void> | null = null;

  protected constructor(workerName: string) {
    const worker = new Worker(getWorkerUrl(workerName));
    super(worker);
    this.worker = worker;
  }

  protected ensureInitialized(task: InitTask) {
    if (this.destroyed) return Promise.reject(new Error('renderer destroyed'));
    if (!this.initPromise) {
      this.initPromise = task()
        .then(() => undefined)
        .catch(error => {
          this.initPromise = null;
          throw error;
        });
    }
    return this.initPromise;
  }

  protected resetInitialization() {
    this.initPromise = null;
  }

  override destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    super.destroy();
    this.worker.terminate();
    this.resetInitialization();
  }

  [Symbol.dispose]() {
    this.destroy();
  }
}
