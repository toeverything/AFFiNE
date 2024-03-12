export class AsyncQueue<T> {
  private _queue: T[];

  private _resolveUpdate: (() => void) | null = null;
  private _waitForUpdate: Promise<void> | null = null;

  constructor(init: T[] = []) {
    this._queue = init;
  }

  get length() {
    return this._queue.length;
  }

  async next(
    abort?: AbortSignal,
    dequeue: (arr: T[]) => T | undefined = a => a.shift()
  ): Promise<T> {
    const update = dequeue(this._queue);
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

      return this.next(abort, dequeue);
    }
  }

  push(...updates: T[]) {
    this._queue.push(...updates);
    if (this._resolveUpdate) {
      const resolve = this._resolveUpdate;
      this._resolveUpdate = null;
      this._waitForUpdate = null;
      resolve();
    }
  }

  remove(predicate: (update: T) => boolean) {
    const index = this._queue.findIndex(predicate);
    if (index !== -1) {
      this._queue.splice(index, 1);
    }
  }

  find(predicate: (update: T) => boolean) {
    return this._queue.find(predicate);
  }

  clear() {
    this._queue = [];
  }
}

export class PriorityAsyncQueue<
  T extends { id: string },
> extends AsyncQueue<T> {
  constructor(
    init: T[] = [],
    public readonly priorityTarget: SharedPriorityTarget = new SharedPriorityTarget()
  ) {
    super(init);
  }

  override next(abort?: AbortSignal | undefined): Promise<T> {
    return super.next(abort, arr => {
      if (this.priorityTarget.priorityRule !== null) {
        const index = arr.findIndex(update =>
          this.priorityTarget.priorityRule?.(update.id)
        );
        if (index !== -1) {
          return arr.splice(index, 1)[0];
        }
      }
      return arr.shift();
    });
  }
}

/**
 * Shared priority target can be shared by multiple queues.
 */
export class SharedPriorityTarget {
  public priorityRule: ((id: string) => boolean) | null = null;
}
