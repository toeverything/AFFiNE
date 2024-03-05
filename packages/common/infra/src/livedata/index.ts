import { DebugLogger } from '@affine/debug';
import {
  distinctUntilChanged,
  EMPTY,
  filter,
  type InteropObservable,
  map,
  Observable,
  type Observer,
  of,
  type OperatorFunction,
  scan,
  skip,
  type Subscription,
  switchMap,
} from 'rxjs';
import { BehaviorSubject, Subject } from 'rxjs';

export * from './react';

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
 * ## Why is it called LiveData
 *
 * This API is very similar to LiveData in Android, as both are based on Observable, so I named it LiveData.
 *
 * @see {@link https://rxjs.dev/api/index/class/BehaviorSubject}
 * @see {@link https://developer.android.com/topic/libraries/architecture/livedata}
 */
export class LiveData<T = unknown> implements InteropObservable<T> {
  static from<T>(
    upstream:
      | Observable<T>
      | InteropObservable<T>
      | ((stream: Observable<LiveDataOperation>) => Observable<T>),
    initialValue: T
  ): LiveData<T> {
    const data = new LiveData(
      initialValue,
      typeof upstream === 'function'
        ? upstream
        : stream =>
            stream.pipe(
              filter(
                (op): op is Exclude<LiveDataOperation, 'set'> => op !== 'set'
              ),
              switchMap(v => {
                if (v === 'get') {
                  return of('watch' as const, 'unwatch' as const);
                } else {
                  return of(v);
                }
              }),
              scan((acc, op) => {
                if (op === 'watch') {
                  return acc + 1;
                } else if (op === 'unwatch') {
                  return acc - 1;
                } else {
                  return acc;
                }
              }, 0),
              map(count => {
                if (count > 0) {
                  return 'watch';
                } else {
                  return 'unwatch';
                }
              }),
              distinctUntilChanged(),
              switchMap(op => {
                if (op === 'watch') {
                  return upstream;
                } else {
                  return EMPTY;
                }
              })
            )
    );

    return data;
  }

  private readonly raw: BehaviorSubject<T>;
  private readonly ops = new Subject<LiveDataOperation>();
  private readonly upstreamSubscription: Subscription | undefined;

  constructor(
    initialValue: T,
    upstream:
      | ((upstream: Observable<LiveDataOperation>) => Observable<T>)
      | undefined = undefined
  ) {
    this.raw = new BehaviorSubject(initialValue);
    if (upstream) {
      this.upstreamSubscription = upstream(this.ops).subscribe({
        next: v => {
          this.raw.next(v);
        },
        complete: () => {
          if (!this.raw.closed) {
            logger.error('livedata upstream unexpected complete');
          }
        },
        error: err => {
          logger.error('uncatched error in livedata', err);
        },
      });
    }
  }

  getValue(): T {
    this.ops.next('get');
    return this.raw.value;
  }

  setValue(v: T) {
    this.raw.next(v);
    this.ops.next('set');
  }

  get value(): T {
    return this.getValue();
  }

  set value(v: T) {
    this.setValue(v);
  }

  next(v: T) {
    this.setValue(v);
  }

  subscribe(
    observer?: Partial<Observer<T>> | ((value: T) => void) | undefined
  ): Subscription {
    this.ops.next('watch');
    const subscription = this.raw.subscribe(observer);
    subscription.add(() => {
      this.ops.next('unwatch');
    });
    return subscription;
  }

  map<R>(mapper: (v: T) => R): LiveData<R> {
    const sub = LiveData.from(
      new Observable<R>(subscriber =>
        this.subscribe({
          next: v => {
            subscriber.next(mapper(v));
          },
          complete: () => {
            sub.complete();
          },
        })
      ),
      undefined as R // is safe
    );

    return sub;
  }

  asObservable(): Observable<T> {
    return new Observable<T>(subscriber => {
      return this.subscribe(subscriber);
    });
  }

  pipe(): Observable<T>;
  pipe<A>(op1: OperatorFunction<T, A>): Observable<A>;
  pipe<A, B>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>
  ): Observable<B>;
  pipe<A, B, C>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>
  ): Observable<C>;
  pipe<A, B, C, D>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>
  ): Observable<D>;
  pipe<A, B, C, D, E>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>
  ): Observable<E>;
  pipe<A, B, C, D, E, F>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>
  ): Observable<F>;
  pipe(...args: any[]) {
    return new Observable(subscriber => {
      this.ops.next('watch');
      // eslint-disable-next-line prefer-spread
      const subscription = this.raw.pipe
        .apply(this.raw, args as any)
        .subscribe(subscriber);
      subscription.add(() => {
        this.ops.next('unwatch');
      });
      return subscription;
    });
  }

  complete() {
    this.ops.complete();
    this.raw.complete();
    this.upstreamSubscription?.unsubscribe();
  }

  reactSubscribe = (cb: () => void) => {
    this.ops.next('watch');
    const subscription = this.raw
      .pipe(distinctUntilChanged(), skip(1))
      .subscribe(cb);
    subscription.add(() => {
      this.ops.next('unwatch');
    });
    return () => subscription.unsubscribe();
  };

  reactGetSnapshot = () => {
    this.ops.next('watch');
    setImmediate(() => {
      this.ops.next('unwatch');
    });
    return this.raw.value;
  };

  [Symbol.observable || '@@observable']() {
    return this;
  }

  [Symbol.observable]() {
    return this;
  }
}

export type LiveDataOperation = 'set' | 'get' | 'watch' | 'unwatch';
