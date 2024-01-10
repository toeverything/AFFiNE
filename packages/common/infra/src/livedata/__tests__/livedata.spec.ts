import { map, Observable, of } from 'rxjs';
import { describe, expect, test, vitest } from 'vitest';
import * as Y from 'yjs';

import { LiveData } from '..';

describe('livedata', () => {
  test('LiveData', async () => {
    const livedata = new LiveData(0);
    expect(livedata.value).toBe(0);
    livedata.next(1);
    expect(livedata.value).toBe(1);
    let subscribed = 0;
    livedata.subscribe(v => {
      subscribed = v;
    });
    livedata.next(2);
    expect(livedata.value).toBe(2);
    await vitest.waitFor(() => subscribed === 2);
  });

  test('from', async () => {
    {
      const livedata = LiveData.from(of(1, 2, 3, 4), 0);
      expect(livedata.value).toBe(4);
    }
    {
      const livedata1 = new LiveData(1);
      const livedata2 = LiveData.from(livedata1.pipe(map(v => 'live' + v)), '');
      expect(livedata2.value).toBe('live1');
      livedata1.next(2);
      expect(livedata2.value).toBe('live2');
    }

    {
      let observableClosed = false;
      const observable = new Observable(() => {
        return () => {
          observableClosed = true;
        };
      });
      const livedata = LiveData.from(observable, 0);
      livedata.complete();
      expect(
        observableClosed,
        'should close parent observable, when livedata complete'
      ).toBe(true);
    }
  });

  test('from yjs', async () => {
    const ydoc = new Y.Doc();
    const ymap = ydoc.getMap('test');

    const livedata = LiveData.fromY<any>(ymap);
    expect(livedata.value).toEqual({});
    ymap.set('a', 1);
    expect(livedata.value).toEqual({ a: 1 });
    ymap.set('b', 2);
    expect(livedata.value).toEqual({ a: 1, b: 2 });
  });
});
