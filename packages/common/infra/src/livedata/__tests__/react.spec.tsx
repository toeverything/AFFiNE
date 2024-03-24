/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { Observable } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { LiveData, useLiveData } from '..';

describe('livedata', () => {
  test('react', () => {
    const livedata$ = new LiveData(0);
    const Component = () => {
      const renderCount = useRef(0);
      renderCount.current++;
      const value = useLiveData(livedata$);
      return (
        <main>
          {renderCount.current}:{value}
        </main>
      );
    };
    const { rerender } = render(<Component />);
    expect(screen.getByRole('main').innerText).toBe('1:0');
    livedata$.next(1);
    rerender(<Component />);
    expect(screen.getByRole('main').innerText).toBe('3:1');
  });

  test('lifecycle', async () => {
    let observableSubscribed = false;
    let observableClosed = false;
    const observable$ = new Observable<number>(subscriber => {
      observableSubscribed = true;
      subscriber.next(1);
      console.log(1);
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
