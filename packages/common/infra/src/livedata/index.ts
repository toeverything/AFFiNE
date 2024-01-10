import { DebugLogger } from '@affine/debug';
import { Observable } from 'rxjs';
import { BehaviorSubject } from 'rxjs';

const logger = new DebugLogger('livedata');

/**
 * LiveData is a reactive data type.
 *
 * ## basic usage
 *
 * @example
 * ```ts
 * const livedata = new LiveData(0); // create livedata with initial value
 *
 * livedata.next(1); // update value
 *
 * console.log(livedata.value); // get current value
 *
 * livedata.subscribe(v => { // subscribe to value changes
 *  console.log(v); // 1
 * });
 * ```
 *
 * ## observable
 *
 * LiveData is a rxjs observable, you can use rxjs operators.
 *
 * @example
 * ```ts
 * new LiveData(0).pipe(
 *   map(v => v + 1),
 *   filter(v => v > 1),
 *   ...
 * )
 * ```
 *
 * NOTICE: different from normal observable, LiveData will always emit the latest value when you subscribe to it.
 *
 * ## from observable
 *
 * LiveData can be created from observable or from other livedata.
 *
 * @example
 * ```ts
 * const A = LiveData.from(
 *   of(1, 2, 3, 4), // from observable
 *   0 // initial value
 * );
 *
 * const B = LiveData.from(
 *   A.pipe(map(v => 'from a ' + v)), // from other livedata
 *   '' // initial value
 * );
 * ```
 *
 * NOTICE: LiveData.from will not complete when the observable completes, you can use `spreadComplete` option to change
 * this behavior.
 *
 * @see {@link https://rxjs.dev/api/index/class/BehaviorSubject}
 */
export class LiveData<T = unknown> extends BehaviorSubject<T> {
  static from<T>(
    observable: Observable<T>,
    initialValue: T,
    { spreadComplete = false }: { spreadComplete?: boolean } = {}
  ): LiveData<T> {
    const data = new LiveData(initialValue);

    const subscription = observable.subscribe({
      next(value) {
        data.next(value);
      },
      error(err) {
        if (spreadComplete) {
          data.error(err);
        } else {
          logger.error('uncatched error in livedata', err);
        }
      },
      complete() {
        if (spreadComplete) {
          data.complete();
        }
      },
    });
    data.subscribe({
      complete() {
        subscription.unsubscribe();
      },
      error() {
        subscription.unsubscribe();
      },
    });

    return data;
  }

  static fromY<T>(ydata: any): LiveData<T> {
    if (typeof ydata.toJSON !== 'function') {
      throw new Error('unsupported yjs type');
    }

    return LiveData.from<T>(
      new Observable(subscriber => {
        ydata.observeDeep(() => {
          subscriber.next(ydata.toJSON());
        });
      }),
      ydata.toJSON()
    );
  }
}

export * from './react';
