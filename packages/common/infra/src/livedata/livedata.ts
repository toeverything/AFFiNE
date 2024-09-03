import { DebugLogger } from '@affine/debug';
import type {
  InteropObservable,
  Observer,
  OperatorFunction,
  Subscription,
  TeardownLogic,
  ThrottleConfig,
} from 'rxjs';
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  map,
  mergeMap,
  Observable,
  of,
  scan,
  skip,
  Subject,
  switchMap,
  throttleTime,
} from 'rxjs';

import { shallowEqual } from '../utils/shallow-equal';

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
export class LiveData<T = unknown>
  extends Observable<T>
  implements InteropObservable<T>
{
  static from<T>(
    upstream$:
      | Observable<T>
      | InteropObservable<T>
      | ((stream: Observable<LiveDataOperation>) => Observable<T>),
    initialValue: T
  ): LiveData<T> {
    const data$ = new LiveData(
      initialValue,
      typeof upstream$ === 'function'
        ? upstream$
        : stream$ =>
            stream$.pipe(
              mergeMap(v => {
                if (v === 'set') {
                  return EMPTY;
                } else if (v === 'get') {
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
                  return upstream$;
                } else {
                  return EMPTY;
                }
              })
            )
    );

    return data$;
  }

  private static GLOBAL_COMPUTED_RECURSIVE_COUNT = 0;

  /**
   * @example
   * ```ts
   * const a = new LiveData('v1');
   * const v1 = new LiveData(100);
   * const v2 = new LiveData(200);
   *
   * const v = LiveData.computed(get => {
   *   return get(a) === 'v1' ? get(v1) : get(v2);
   * });
   *
   * expect(v.value).toBe(100);
   * ```
   */
  static computed<T>(
    compute: (get: <L>(data: LiveData<L>) => L) => T
  ): LiveData<T> {
    return LiveData.from(
      new Observable(subscribe => {
        const execute = (next: () => void) => {
          const subscriptions: Subscription[] = [];
          const getfn = <L>(data$: LiveData<L>) => {
            let value = null as L;
            let first = true;
            subscriptions.push(
              data$.subscribe({
                error(err) {
                  subscribe.error(err);
                },
                next(v) {
                  value = v;
                  if (!first) {
                    next();
                  }
                  first = false;
                },
              })
            );
            return value;
          };

          LiveData.GLOBAL_COMPUTED_RECURSIVE_COUNT++;

          try {
            if (LiveData.GLOBAL_COMPUTED_RECURSIVE_COUNT > 10) {
              subscribe.error(new Error('computed recursive limit exceeded'));
            } else {
              subscribe.next(compute(getfn));
            }
          } catch (err) {
            subscribe.error(err);
          } finally {
            LiveData.GLOBAL_COMPUTED_RECURSIVE_COUNT--;
          }

          return () => {
            subscriptions.forEach(s => s.unsubscribe());
          };
        };

        let prev = () => {};

        const looper = () => {
          const dispose = execute(looper);
          prev();
          prev = dispose;
        };

        looper();

        return () => {
          prev();
        };
      }),
      null as any
    );
  }

  private readonly raw$: BehaviorSubject<T>;
  private readonly ops$ = new Subject<LiveDataOperation>();
  private readonly upstreamSubscription: Subscription | undefined;

  /**
   * When the upstream Observable of livedata throws an error, livedata will enter poisoned state. This is an
   * unrecoverable abnormal state. Any operation on livedata will throw a PoisonedError.
   *
   * Since the development specification for livedata is not to throw any error, entering the poisoned state usually
   * means a programming error.
   */
  private isPoisoned = false;
  private poisonedError: PoisonedError | null = null;

  constructor(
    initialValue: T,
    upstream:
      | ((upstream: Observable<LiveDataOperation>) => Observable<T>)
      | undefined = undefined
  ) {
    super();
    this.raw$ = new BehaviorSubject(initialValue);
    if (upstream) {
      this.upstreamSubscription = upstream(this.ops$).subscribe({
        next: v => {
          this.raw$.next(v);
        },
        complete: () => {
          if (!this.raw$.closed) {
            logger.error('livedata upstream unexpected complete');
          }
        },
        error: err => {
          logger.error('uncatched error in livedata', err);
          this.isPoisoned = true;
          this.poisonedError = new PoisonedError(err);
          this.raw$.error(this.poisonedError);
        },
      });
    }
  }

  getValue = (): T => {
    if (this.isPoisoned) {
      throw this.poisonedError;
    }
    this.ops$.next('get');
    return this.raw$.value;
  };

  setValue = (v: T) => {
    if (this.isPoisoned) {
      throw this.poisonedError;
    }
    this.raw$.next(v);
    this.ops$.next('set');
  };

  get value(): T {
    return this.getValue();
  }

  set value(v: T) {
    this.next(v);
  }

  next = (v: T) => {
    if (this.isPoisoned) {
      throw this.poisonedError;
    }
    return this.setValue(v);
  };

  override subscribe(
    observerOrNext?: Partial<Observer<T>> | ((value: T) => void)
  ): Subscription;
  override subscribe(
    next?: ((value: T) => void) | null,
    error?: ((error: any) => void) | null,
    complete?: (() => void) | null
  ): Subscription;
  override subscribe(
    observerOrNext?: Partial<Observer<T>> | ((value: T) => void) | null,
    error?: ((error: any) => void) | null,
    complete?: (() => void) | null
  ): Subscription {
    this.ops$.next('watch');
    const subscription = this.raw$.subscribe(
      observerOrNext as any,
      error,
      complete
    );
    subscription.add(() => {
      this.ops$.next('unwatch');
    });
    return subscription;
  }

  map<R>(mapper: (v: T) => R): LiveData<R> {
    const sub$ = LiveData.from(
      new Observable<R>(subscriber =>
        this.subscribe({
          next: v => {
            subscriber.next(mapper(v));
          },
          complete: () => {
            sub$.complete();
          },
        })
      ),
      undefined as R // is safe
    );

    return sub$;
  }

  /**
   * same as map, but do shallow equal check before emit
   */
  selector<R>(selector: (v: T) => R): LiveData<R> {
    const sub$ = LiveData.from(
      new Observable<R>(subscriber => {
        let last: any = undefined;
        return this.subscribe({
          next: v => {
            const data = selector(v);
            if (!shallowEqual(last, data)) {
              subscriber.next(data);
            }
            last = data;
          },
          complete: () => {
            sub$.complete();
          },
        });
      }),
      undefined as R // is safe
    );

    return sub$;
  }

  distinctUntilChanged(comparator?: (previous: T, current: T) => boolean) {
    return LiveData.from(
      this.pipe(distinctUntilChanged(comparator)),
      null as T
    );
  }

  throttleTime(
    duration: number,
    { trailing = true, leading = true }: ThrottleConfig = {}
  ) {
    return LiveData.from<T>(
      this.pipe(throttleTime(duration, undefined, { trailing, leading })),
      null as any
    );
  }

  // eslint-disable-next-line rxjs/finnish
  asObservable(): Observable<T> {
    return new Observable<T>(subscriber => {
      return this.subscribe(subscriber);
    });
  }

  override pipe(): Observable<T>;
  override pipe<A>(op1: OperatorFunction<T, A>): Observable<A>;
  override pipe<A, B>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>
  ): Observable<B>;
  override pipe<A, B, C>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>
  ): Observable<C>;
  override pipe<A, B, C, D>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>
  ): Observable<D>;
  override pipe<A, B, C, D, E>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>
  ): Observable<E>;
  override pipe<A, B, C, D, E, F>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>
  ): Observable<F>;
  override pipe(...args: any[]) {
    return new Observable(subscriber => {
      this.ops$.next('watch');
      // eslint-disable-next-line prefer-spread
      const subscription = this.raw$.pipe
        .apply(this.raw$, args as any)
        .subscribe(subscriber);
      subscription.add(() => {
        this.ops$.next('unwatch');
      });
      return subscription;
    });
  }

  complete() {
    this.ops$.complete();
    this.raw$.complete();
    this.upstreamSubscription?.unsubscribe();
  }

  /**
   * flatten the livedata
   *
   * ```
   * new LiveData(new LiveData(0)).flat() // LiveData<number>
   * ```
   *
   * ```
   * new LiveData([new LiveData(0)]).flat() // LiveData<number[]>
   * ```
   */
  flat(): Flat<this> {
    return LiveData.from(
      this.pipe(
        switchMap(v => {
          if (v instanceof LiveData) {
            return (v as LiveData<any>).flat();
          } else if (Array.isArray(v)) {
            if (v.length === 0) {
              return of([]);
            }
            return combineLatest(
              v.map(v => {
                if (v instanceof LiveData) {
                  return v.flat();
                } else {
                  return of(v);
                }
              })
            );
          } else {
            return of(v);
          }
        })
      ),
      null as any
    ) as any;
  }

  static flat<T>(v: T): Flat<LiveData<T>> {
    return new LiveData(v).flat();
  }

  waitFor(predicate: (v: T) => unknown, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const subscription = this.subscribe(v => {
        if (predicate(v)) {
          resolve(v as any);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          Promise.resolve().then(() => {
            subscription.unsubscribe();
          });
        }
      });
      signal?.addEventListener('abort', reason => {
        subscription.unsubscribe();
        reject(reason);
      });
    });
  }

  waitForNonNull(signal?: AbortSignal) {
    return this.waitFor(v => v !== null && v !== undefined, signal) as Promise<
      NonNullable<T>
    >;
  }

  reactSubscribe = (cb: () => void) => {
    if (this.isPoisoned) {
      throw this.poisonedError;
    }
    this.ops$.next('watch');
    const subscription = this.raw$
      .pipe(distinctUntilChanged(), skip(1))
      .subscribe(cb);
    subscription.add(() => {
      this.ops$.next('unwatch');
    });
    return () => subscription.unsubscribe();
  };

  reactGetSnapshot = () => {
    if (this.isPoisoned) {
      throw this.poisonedError;
    }
    this.ops$.next('watch');
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- never throw
    Promise.resolve().then(() => {
      this.ops$.next('unwatch');
    });
    return this.raw$.value;
  };

  protected _subscribe(): TeardownLogic {
    throw new Error('Method not implemented.');
  }

  [Symbol.observable || '@@observable']() {
    return this;
  }

  [Symbol.observable]() {
    return this;
  }
}

export type LiveDataOperation = 'set' | 'get' | 'watch' | 'unwatch';

export type Unwrap<T> =
  T extends LiveData<infer Z>
    ? Unwrap<Z>
    : T extends LiveData<infer A>[]
      ? Unwrap<A>[]
      : T;

export type Flat<T> = T extends LiveData<infer P> ? LiveData<Unwrap<P>> : T;

export class PoisonedError extends Error {
  constructor(originalError: any) {
    super(
      'The livedata is poisoned, original error: ' +
        (originalError instanceof Error ? originalError.stack : originalError)
    );
  }
}
