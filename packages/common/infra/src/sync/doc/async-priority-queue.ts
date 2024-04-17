import { PriorityQueue } from './priority-queue';

export class AsyncPriorityQueue extends PriorityQueue {
  private _resolveUpdate: (() => void) | null = null;
  private _waitForUpdate: Promise<void> | null = null;

  async asyncPop(abort?: AbortSignal): Promise<string> {
    const update = this.pop();
    if (update) {
      return update;
    } else {
      if (!this._waitForUpdate) {
        this._waitForUpdate = new Promise(resolve => {
          this._resolveUpdate = resolve;
        });
      }

      await Promise.race([
        this._waitForUpdate,
        new Promise((_, reject) => {
          if (abort?.aborted) {
            reject(abort?.reason);
          }
          abort?.addEventListener('abort', () => {
            reject(abort.reason);
          });
        }),
      ]);

      return this.asyncPop(abort);
    }
  }

  override push(id: string, priority: number = 0) {
    super.push(id, priority);
    if (this._resolveUpdate) {
      const resolve = this._resolveUpdate;
      this._resolveUpdate = null;
      this._waitForUpdate = null;
      resolve();
    }
  }
}
