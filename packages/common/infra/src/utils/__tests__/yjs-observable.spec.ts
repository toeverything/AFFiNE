import { describe, expect, test } from 'vitest';
import { Doc as YDoc, Map as YMap } from 'yjs';

import { yjsObserveByPath } from '../yjs-observable';

describe('yjs observable', () => {
  test('basic', async () => {
    const ydoc = new YDoc();
    let currentValue: any = false;
    yjsObserveByPath(ydoc.getMap('foo'), 'key.subkey').subscribe(
      v => (currentValue = v)
    );
    expect(currentValue).toBe(undefined);

    ydoc.getMap('foo').set('key', new YMap([['subkey', 'xxxzzz']]));
    expect(currentValue).toBe('xxxzzz');

    (ydoc.getMap('foo').get('key') as YMap<string>).set('subkey', 'yyy');
    expect(currentValue).toBe('yyy');

    (ydoc.getMap('foo').get('key') as YMap<string>).delete('subkey');
    expect(currentValue).toBe(undefined);

    (ydoc.getMap('foo').get('key') as YMap<string>).set('subkey', 'yyy');
    ydoc.getMap('foo').delete('key');
    expect(currentValue).toBe(undefined);

    ydoc.getMap('foo').set('key', 'text');
    expect(currentValue).toBe(undefined);
  });
});
