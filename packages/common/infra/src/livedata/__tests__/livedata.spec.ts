import type { Subscriber } from 'rxjs';
import { combineLatest, Observable, of } from 'rxjs';
import { describe, expect, test, vitest } from 'vitest';

import { LiveData, PoisonedError } from '..';

describe('livedata', () => {
  test('LiveData', async () => {
    const livedata$ = new LiveData(0);
    expect(livedata$.value).toBe(0);
    livedata$.next(1);
    expect(livedata$.value).toBe(1);
    let subscribed = 0;
    livedata$.subscribe(v => {
      subscribed = v;
    });
    livedata$.next(2);
    expect(livedata$.value).toBe(2);
    await vitest.waitFor(() => subscribed === 2);
  });

  test('from', async () => {
    {
      const livedata$ = LiveData.from(of(1, 2, 3, 4), 0);
      expect(livedata$.value).toBe(4);
    }

    {
      let subscriber: Subscriber<number> = null!;
      const observable$ = new Observable<number>(s => {
        subscriber = s;
      });
      const livedata$ = LiveData.from(observable$, 0);
      let value = 0;
      livedata$.subscribe(v => {
        value = v;
      });

      expect(value).toBe(0);
      subscriber.next(1);
      expect(value).toBe(1);
      subscriber.next(2);
      expect(value).toBe(2);
    }

    {
      let observableSubscribed = false;
      let observableClosed = false;
      const observable$ = new Observable(subscriber => {
        observableSubscribed = true;
        subscriber.next(1);
        return () => {
          observableClosed = true;
        };
      });
      const livedata$ = LiveData.from(observable$, 0);
      expect(observableSubscribed).toBe(false);
      const subscription = livedata$.subscribe(_ => {});
      expect(observableSubscribed).toBe(true);
      expect(observableClosed).toBe(false);
      subscription.unsubscribe();
      expect(observableClosed).toBe(true);
    }

    {
      let subscriber: Subscriber<number> = null!;
      const observable$ = new Observable<number>(s => {
        subscriber = s;
      });
      const livedata$ = LiveData.from(observable$, 0);
      let value1 = 0;
      livedata$.subscribe(v => {
        value1 = v;
      });

      let value2 = 0;
      livedata$.subscribe(v => {
        value2 = v;
      });

      expect(value1).toBe(0);
      expect(value2).toBe(0);
      subscriber.next(1);
      expect(value1).toBe(1);
      expect(value2).toBe(1);
      subscriber.next(2);
      expect(value1).toBe(2);
      expect(value2).toBe(2);
    }

    {
      let observableSubscribed = false;
      let observableClosed = false;
      const observable$ = new Observable(subscriber => {
        observableSubscribed = true;
        subscriber.next(1);
        return () => {
          observableClosed = true;
        };
      });
      const livedata$ = LiveData.from(observable$, 0);
      expect(observableSubscribed).toBe(false);
      const subscription1 = livedata$.subscribe(_ => {});
      const subscription2 = livedata$.subscribe(_ => {});
      expect(observableSubscribed).toBe(true);
      expect(observableClosed).toBe(false);
      subscription1.unsubscribe();
      expect(observableClosed).toBe(false);
      subscription2.unsubscribe();
      expect(observableClosed).toBe(true);
    }

    {
      let observerCount = 0;
      const observable$ = new Observable(_ => {
        observerCount++;
      });
      const livedata$ = LiveData.from(observable$, 0);
      livedata$.subscribe(_ => {});
      livedata$.subscribe(_ => {});
      expect(observerCount).toBe(1);
    }

    {
      let value = 0;
      const observable$ = new Observable<number>(subscriber => {
        subscriber.next(value);
      });
      const livedata$ = LiveData.from(observable$, 0);
      expect(livedata$.value).toBe(0);
      value = 1;
      expect(livedata$.value).toBe(1);
    }
  });

  test('poisoned', () => {
    {
      let subscriber: Subscriber<number> = null!;
      const livedata$ = LiveData.from<number>(
        new Observable(sub => {
          subscriber = sub;
        }),
        1
      );

      let value: number = 0;
      let error: any = null;
      livedata$.subscribe({
        next: v => {
          value = v;
        },
        error: e => {
          error = e;
        },
      });
      expect(value).toBe(1);
      subscriber.next(2);
      expect(value).toBe(2);

      expect(error).toBe(null);
      subscriber.error('error');
      expect(error).toBeInstanceOf(PoisonedError);

      expect(() => livedata$.next(3)).toThrowError(PoisonedError);
      expect(() => livedata$.value).toThrowError(PoisonedError);

      let error2: any = null;
      livedata$.subscribe({
        error: e => {
          error2 = e;
        },
      });
      expect(error2).toBeInstanceOf(PoisonedError);
    }
  });

  test('map', () => {
    {
      const livedata$ = new LiveData(0);
      const mapped$ = livedata$.map(v => v + 1);
      expect(mapped$.value).toBe(1);
      livedata$.next(1);
      expect(mapped$.value).toBe(2);
    }

    {
      const livedata$ = new LiveData(0);
      const mapped$ = livedata$.map(v => v + 1);
      let value = 0;
      mapped$.subscribe(v => {
        value = v;
      });
      expect(value).toBe(1);
      livedata$.next(1);
      expect(value).toBe(2);
    }

    {
      let observableSubscribed = false;
      let observableClosed = false;
      const observable$ = new Observable<number>(subscriber => {
        observableSubscribed = true;
        subscriber.next(1);
        return () => {
          observableClosed = true;
        };
      });

      const livedata$ = LiveData.from(observable$, 0);
      const mapped$ = livedata$.map(v => v + 1);

      expect(observableSubscribed).toBe(false);
      const subscription = mapped$.subscribe(_ => {});
      expect(observableSubscribed).toBe(true);
      expect(observableClosed).toBe(false);
      subscription.unsubscribe();
      expect(observableClosed).toBe(true);
    }
  });

  test('interop with rxjs', () => {
    const ob$ = combineLatest([new LiveData(1)]);
    let value = 0;
    ob$.subscribe(v => {
      value = v[0];
    });
    expect(value).toBe(1);
  });

  test('flat', () => {
    {
      const wrapped$ = new LiveData(new LiveData(0));
      const flatten$ = wrapped$.flat();
      expect(flatten$.value).toBe(0);

      wrapped$.next(new LiveData(1));
      expect(flatten$.value).toBe(1);

      wrapped$.next(LiveData.from(of(2, 3), 0));
      expect(flatten$.value).toBe(3);
    }

    {
      const wrapped$ = new LiveData(
        new LiveData([
          new LiveData(new LiveData(1)),
          new LiveData(new LiveData(2)),
        ])
      );
      const flatten$ = wrapped$.flat();
      expect(flatten$.value).toStrictEqual([1, 2]);
    }

    {
      const wrapped$ = new LiveData([new LiveData(0), new LiveData(1)]);
      const flatten$ = wrapped$.flat();

      expect(flatten$.value).toEqual([0, 1]);

      const inner$ = new LiveData(2);
      wrapped$.next([inner$, new LiveData(3)]);
      expect(flatten$.value).toEqual([2, 3]);
      inner$.next(4);
      expect(flatten$.value).toEqual([4, 3]);
    }

    {
      const wrapped$ = new LiveData([] as LiveData<number>[]);
      const flatten$ = wrapped$.flat();

      expect(flatten$.value).toEqual([]);
    }
  });

  test('computed', () => {
    {
      const a$ = new LiveData(1);
      const b$ = LiveData.computed(get => get(a$) + 1);
      expect(b$.value).toBe(2);
    }

    {
      const a$ = new LiveData('v1');
      const v1$ = new LiveData(100);
      const v2$ = new LiveData(200);

      const v$ = LiveData.computed(get => {
        return get(a$) === 'v1' ? get(v1$) : get(v2$);
      });

      expect(v$.value).toBe(100);

      a$.next('v2');
      expect(v$.value).toBe(200);
    }

    {
      let watched = false;
      let count = 0;
      let subscriber: Subscriber<number> = null!;
      const a$ = LiveData.from<number>(
        new Observable(sub => {
          count++;
          watched = true;
          subscriber = sub;
          sub.next(1);
          return () => {
            watched = false;
          };
        }),
        0
      );
      const b$ = LiveData.computed(get => get(a$) + 1);

      expect(watched).toBe(false);
      expect(count).toBe(0);

      const subscription = b$.subscribe(_ => {});
      expect(watched).toBe(true);
      expect(count).toBe(1);
      subscriber.next(2);
      expect(b$.value).toBe(3);

      subscription.unsubscribe();
      expect(watched).toBe(false);
      expect(count).toBe(1);
    }

    {
      let c$ = null! as LiveData<number>;
      const b$ = LiveData.computed(get => get(c$) + 1);
      c$ = LiveData.computed(get => get(b$) + 1);

      expect(() => b$.value).toThrowError(PoisonedError);
    }
  });
});
