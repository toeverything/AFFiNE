import {
  asyncScheduler,
  defer,
  exhaustMap,
  finalize,
  type Observable,
  type ObservableInput,
  type OperatorFunction,
  scheduled,
  Subject,
  throttle,
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
