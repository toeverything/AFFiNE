import { Observable, type OperatorFunction } from 'rxjs';

/**
 * Creates an operator that takes values from the source Observable until the given AbortSignal aborts.
 * When the signal aborts, the Observable completes.
 *
 * @param signal - The AbortSignal that will trigger completion when aborted
 * @returns An operator function that takes values until the signal aborts
 */
export function takeUntilAbort<T>(
  signal?: AbortSignal
): OperatorFunction<T, T> {
  return (source$: Observable<T>) => {
    return new Observable<T>(subscriber => {
      if (signal?.aborted) {
        subscriber.error(signal.reason);
        return;
      }

      const abortHandler = () => {
        subscriber.error(signal?.reason);
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler);
      }

      const subscription = source$.subscribe({
        next: value => subscriber.next(value),
        error: err => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      return () => {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        subscription.unsubscribe();
      };
    });
  };
}
