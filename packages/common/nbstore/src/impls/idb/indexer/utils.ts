import {
  asyncScheduler,
  defer,
  exhaustMap,
  finalize,
  type Observable,
  type ObservableInput,
  type OperatorFunction,
  retry,
  scheduled,
  Subject,
  throttle,
  throwError,
  timer,
} from 'rxjs';

/**
 * Like exhaustMap, but also includes the trailing value emitted from the source observable while waiting for the preceding inner observable to complete
 *
 * Original code adapted from https://github.com/ReactiveX/rxjs/issues/5004
 * @param {function<T, K>(value: T, ?index: number): ObservableInput<K>} project - A function that, when applied to an item emitted by the
 * source Observable, returns a projected Observable.
 */
export function exhaustMapWithTrailing<T, R>(
  project: (value: T, index: number) => ObservableInput<R>
): OperatorFunction<T, R> {
  return (source$): Observable<R> =>
    defer(() => {
      const release$ = new Subject<void>();
      return source$.pipe(
        throttle(() => release$, {
          leading: true,
          trailing: true,
        }),
        exhaustMap((value, index) =>
          scheduled(project(value, index), asyncScheduler).pipe(
            finalize(() => {
              release$.next();
            })
          )
        )
      );
    });
}

/**
 * An operator that retries the source observable when an error occurs.
 *
 * https://en.wikipedia.org/wiki/Exponential_backoff
 */
export function backoffRetry<T>({
  when,
  count = 3,
  delay = 200,
  maxDelay = 15000,
}: {
  when?: (err: any) => boolean;
  count?: number;
  delay?: number;
  maxDelay?: number;
} = {}) {
  return (obs$: Observable<T>) =>
    obs$.pipe(
      retry({
        count,
        delay: (err, retryIndex) => {
          if (when && !when(err)) {
            return throwError(() => err);
          }
          const d = Math.pow(2, retryIndex - 1) * delay;
          return timer(Math.min(d, maxDelay));
        },
      })
    );
}
