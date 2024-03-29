/**
 * @vitest-environment happy-dom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import type { Subscriber } from 'rxjs';
import { Observable } from 'rxjs';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { LiveData, useLiveData } from '..';

describe('livedata', () => {
  afterEach(() => {
    cleanup();
  });
  test('react', async () => {
    const livedata$ = new LiveData(0);
    let renderCount = 0;
    const Component = () => {
      renderCount++;
      const value = useLiveData(livedata$);
      return <main>{value}</main>;
    };
    render(<Component />);
    expect(screen.getByRole('main').innerText).toBe('0');
    livedata$.next(1);
    // wait for rerender
    await waitFor(() => expect(screen.getByRole('main').innerText).toBe('1'));
    expect(renderCount).toBe(2);
  });

  test('react livedata.map', async () => {
    const livedata$ = new LiveData(0);
    let renderCount = 0;
    const Component = () => {
      renderCount++;
      const value = useLiveData(livedata$.map(v => v + 1));
      return <main>{value}</main>;
    };
    render(<Component />);
    expect(screen.getByRole('main').innerText).toBe('1');
    livedata$.next(1);
    // wait for rerender
    await waitFor(() => expect(screen.getByRole('main').innerText).toBe('2'));
    expect(renderCount).toBe(2);
  });

  test('react livedata.map heavy object copy', async () => {
    const livedata$ = new LiveData({ hello: 'world' });
    let renderCount = 0;
    let objectCopyCount = 0;
    const Component = () => {
      renderCount++;

      const value = useLiveData(
        livedata$.map(v => {
          objectCopyCount++;
          return { ...v };
        })
      );
      return <main>{value.hello}</main>;
    };
    const { rerender } = render(<Component />);
    expect(screen.getByRole('main').innerText).toBe('world');
    livedata$.next({ hello: 'foobar' });
    // wait for rerender
    await waitFor(() =>
      expect(screen.getByRole('main').innerText).toBe('foobar')
    );
    expect(renderCount).toBe(2);
    expect(objectCopyCount).toBe(3);

    rerender(<Component />);
    expect(renderCount).toBe(3);
    expect(objectCopyCount).toBe(4);
  });

  test('react useMemo livedata.map heavy object copy', async () => {
    const livedata$ = new LiveData({ hello: 'world' });
    let renderCount = 0;
    let objectCopyCount = 0;
    const Component = () => {
      renderCount++;
      const value = useLiveData(
        useMemo(
          () =>
            livedata$.map(v => {
              objectCopyCount++;
              return { ...v };
            }),
          []
        )
      );
      return <main>{value.hello}</main>;
    };
    const { rerender } = render(<Component />);
    expect(screen.getByRole('main').innerText).toBe('world');
    livedata$.next({ hello: 'foobar' });
    // wait for rerender
    await waitFor(() =>
      expect(screen.getByRole('main').innerText).toBe('foobar')
    );
    expect(renderCount).toBe(2);
    expect(objectCopyCount).toBe(2);

    rerender(<Component />);
    expect(renderCount).toBe(3);
    expect(objectCopyCount).toBe(2);
  });

  test('react useLiveData with livedata from observable', async () => {
    let subscribeCount = 0;
    let renderCount = 0;

    let innerSubscriber: Subscriber<{
      value: number;
    }> = null!;

    const livedata$ = LiveData.from(
      new Observable<{ value: number }>(subscriber => {
        subscribeCount++;
        subscriber.next({ value: 1 });
        innerSubscriber = subscriber;
      }),
      { value: 0 }
    );

    const Component = () => {
      renderCount++;
      const value = useLiveData(
        livedata$.map(v => ({
          value: v.value + 1,
        }))
      ).value;
      return <main>{value}</main>;
    };
    const { rerender } = render(<Component />);
    expect(screen.getByRole('main').innerText).toBe('2');

    expect(subscribeCount).toBe(1);
    expect(renderCount).toBe(1);

    innerSubscriber.next({ value: 2 });

    await waitFor(() => expect(screen.getByRole('main').innerText).toBe('3'));
    expect(subscribeCount).toBe(1);
    expect(renderCount).toBe(2);

    rerender(<Component />);
    expect(subscribeCount).toBe(1);
    expect(renderCount).toBe(3);
  });

  test('lifecycle', async () => {
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
    const Component1 = () => {
      const value = useLiveData(livedata$);
      return <main>{value}</main>;
    };

    expect(observableSubscribed).toBe(false);
    const { rerender } = render(<Component1 />);
    expect(observableSubscribed).toBe(true);

    expect(observableClosed).toBe(false);
    const Component2 = () => {
      return <main></main>;
    };
    rerender(<Component2 />);
    await vi.waitUntil(() => observableClosed);
  });
});
