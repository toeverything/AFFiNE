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
