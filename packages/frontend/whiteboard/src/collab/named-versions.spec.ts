import { describe, expect, it } from 'vitest';

import {
  labelForVersion,
  loadNamedVersions,
  namedVersionStorageKey,
  parseNamedVersions,
  saveNamedVersionLabel,
} from './named-versions';

describe('named versions', () => {
  it('stores snapshot labels without treating history as git branches', () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const key = namedVersionStorageKey('ws', 'doc');
    const next = saveNamedVersionLabel(
      adapter,
      'ws',
      'doc',
      '1710000000000',
      '  Workshop kickoff  '
    );
    expect(next['1710000000000']).toBe('Workshop kickoff');
    expect(loadNamedVersions(adapter, 'ws', 'doc')['1710000000000']).toBe(
      'Workshop kickoff'
    );
    expect(labelForVersion(next, '1710000000000')).toBe('Workshop kickoff');
    expect(parseNamedVersions(storage.get(key))).toEqual(next);
    saveNamedVersionLabel(adapter, 'ws', 'doc', '1710000000000', '  ');
    expect(loadNamedVersions(adapter, 'ws', 'doc')).toEqual({});
  });
});
