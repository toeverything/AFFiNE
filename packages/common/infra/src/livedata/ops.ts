import {
  catchError,
  EMPTY,
  mergeMap,
  Observable,
  type OperatorFunction,
  pipe,
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
