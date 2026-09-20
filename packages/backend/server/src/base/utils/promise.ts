import { setTimeout as delay } from 'node:timers/promises';

import { defer as rxjsDefer, retry } from 'rxjs';

export class RetryablePromise<T> extends Promise<T> {
  constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: any) => void
    ) => void,
    retryTimes: number = 3,
    retryIntervalInMs: number = 300
  ) {
    super((resolve, reject) => {
      rxjsDefer(() => new Promise<T>(executor))
        .pipe(
          retry({
            count: retryTimes,
            delay: retryIntervalInMs,
          })
        )
        .subscribe({
          next: v => {
            resolve(v);
          },
          error: e => {
            reject(e);
          },
        });
    });
  }
}

export function retryable<Ret = unknown>(
  asyncFn: () => Promise<Ret>,
  retryTimes = 3,
  retryIntervalInMs = 300
): Promise<Ret> {
  return new RetryablePromise<Ret>(
    (resolve, reject) => {
      asyncFn().then(resolve).catch(reject);
    },
    retryTimes,
    retryIntervalInMs
  );
}

export function defer(dispose: () => Promise<void>) {
  return {
    [Symbol.asyncDispose]: dispose,
  };
}

export function sleep(ms: number): Promise<void> {
  return delay(ms);
}

export function exponentialBackoffDelay(
  attempt: number,
  {
    baseDelayMs,
    maxDelayMs,
    factor = 2,
  }: { baseDelayMs: number; maxDelayMs: number; factor?: number }
): number {
  return Math.min(
    baseDelayMs * Math.pow(factor, Math.max(0, attempt)),
    maxDelayMs
  );
}

export class ExponentialBackoffScheduler {
  #attempt = 0;
  #timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  constructor(
    private readonly options: {
      baseDelayMs: number;
      maxDelayMs: number;
      factor?: number;
    }
  ) {}

  get pending() {
    return this.#timer !== null;
  }

  clear() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  reset() {
    this.#attempt = 0;
    this.clear();
  }

  schedule(callback: () => void) {
    if (this.#timer) return null;

    const timeout = exponentialBackoffDelay(this.#attempt, this.options);
    this.#timer = globalThis.setTimeout(() => {
      this.#timer = null;
      callback();
    }, timeout);
    this.#attempt += 1;

    return timeout;
  }
}
