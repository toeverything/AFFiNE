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
  tap,
  timer,
} from 'rxjs';

import type { LiveData } from './livedata';

export function mapInto<T>(l$: LiveData<T>) {
  return pipe(
    mergeMap((value: T) => {
      l$.next(value);
      return EMPTY;
    })
  );
}

export function catchErrorInto(l$: LiveData<any>) {
  return pipe(
    catchError((error: any) => {
      l$.next(error);
      return EMPTY;
    })
  );
}

export function tapError(cb: (value: any) => void) {
  return pipe(
    tap({
      error(err) {
        cb(err);
      },
    })
  );
}

export function onStart<T>(cb: () => void): OperatorFunction<T, T> {
  return observable$ =>
    new Observable(subscribe => {
      cb();
      return observable$.subscribe(subscribe);
    });
}

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

    return () => abortController.abort('Aborted');
  });
}

export function backoffRetry<T>({
  count = 3,
  delay = 200,
  maxDelay = 15000,
}: { count?: number; delay?: number; maxDelay?: number } = {}) {
  return (obs$: Observable<T>) =>
    obs$.pipe(
      retry({
        count,
        delay: (_, retryIndex) => {
          const d = Math.pow(2, retryIndex - 1) * delay;
          return timer(Math.max(d, maxDelay));
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
