import { Observable } from 'rxjs';

import { MANUALLY_STOP } from './throw-if-aborted';

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
        if (subscriber.closed) {
          return;
        }
        subscriber.next(value);
        subscriber.complete();
      })
      .catch(error => {
        if (subscriber.closed) {
          return;
        }
        if (error === MANUALLY_STOP) {
          subscriber.complete();
          return;
        }
        subscriber.error(error);
      });

    return () => abortController.abort(MANUALLY_STOP);
  });
}
