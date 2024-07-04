import {
  catchError,
  connect,
  distinctUntilChanged,
  EMPTY,
  exhaustMap,
  merge,
  mergeMap,
  Observable,
  type ObservableInput,
  type ObservedValueOf,
  of,
  type OperatorFunction,
  pipe,
  retry,
  switchMap,
  throwError,
  timer,
} from 'rxjs';

import { MANUALLY_STOP } from '../utils';
import type { LiveData } from './livedata';

/**
 * An operator that maps the value to the `LiveData`.
 */
export function mapInto<T>(l$: LiveData<T>) {
  return pipe(
    mergeMap((value: T) => {
      l$.next(value);
      return EMPTY;
    })
  );
}

/**
 * An operator that catches the error and sends it to the `LiveData`.
 *
 * The `LiveData` will be set to `null` when the observable completes. This is useful for error state recovery.
 *
 * @param cb A callback that will be called when an error occurs.
 */
export function catchErrorInto<Error = any>(
  l$: LiveData<Error | null>,
  cb?: (error: Error) => void
) {
  return pipe(
    onComplete(() => l$.next(null)),
    catchError((error: any) => {
      l$.next(error);
      cb?.(error);
      return EMPTY;
    })
  );
}

/**
 * An operator that calls the callback when the observable starts.
 */
export function onStart<T>(cb: () => void): OperatorFunction<T, T> {
  return observable$ =>
    new Observable(subscribe => {
      cb();
      return observable$.subscribe(subscribe);
    });
}

/**
 * An operator that calls the callback when the observable completes.
 */
export function onComplete<T>(cb: () => void): OperatorFunction<T, T> {
  return observable$ =>
    new Observable(subscribe => {
      return observable$.subscribe({
        complete() {
          cb();
          subscribe.complete();
        },
        error(err) {
          subscribe.error(err);
        },
        next(value) {
          subscribe.next(value);
        },
      });
    });
}

/**
 * Convert a promise to an observable.
 *
 * like `from` but support `AbortSignal`.
 */
export function fromPromise<T>(
  promise: Promise<T> | ((signal: AbortSignal) => Promise<T>)
): Observable<T> {
  return new Observable(subscriber => {
    const abortController = new AbortController();

    const rawPromise =
      promise instanceof Function ? promise(abortController.signal) : promise;

    rawPromise
      .then(value => {
        subscriber.next(value);
        subscriber.complete();
      })
      .catch(error => {
        subscriber.error(error);
      });

    return () => abortController.abort(MANUALLY_STOP);
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

/**
 * An operator that combines `exhaustMap` and `switchMap`.
 *
 * This operator executes the `comparator` on each input, acting as an `exhaustMap` when the `comparator` returns `true`
 * and acting as a `switchMap` when the comparator returns `false`.
 *
 * It is more useful for async processes that are relatively stable in results but sensitive to input.
 * For example, when requesting the user's subscription status, `exhaustMap` is used because the user's subscription
 * does not change often, but when switching users, the request should be made immediately like `switchMap`.
 *
 * @param onSwitch callback will be executed when `switchMap` occurs (including the first execution).
 */
export function exhaustMapSwitchUntilChanged<T, O extends ObservableInput<any>>(
  comparator: (previous: T, current: T) => boolean,
  project: (value: T, index: number) => O,
  onSwitch?: (value: T) => void
): OperatorFunction<T, ObservedValueOf<O>> {
  return pipe(
    connect(shared$ =>
      shared$.pipe(
        distinctUntilChanged(comparator),
        switchMap(value => {
          onSwitch?.(value);
          return merge(of(value), shared$).pipe(
            exhaustMap((value, index) => {
              return project(value, index);
            })
          );
        })
      )
    )
  );
}
