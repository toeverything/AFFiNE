import { describe, expect, test } from 'vitest';

import { pickParentDoc } from '../services/doc-ancestors';

describe('pickParentDoc', () => {
  test('returns null when there is no candidate', () => {
    expect(pickParentDoc([])).toBeNull();
  });

  test('prefers the oldest doc', () => {
    expect(
      pickParentDoc([
        { id: 'b', createDate: 200, isJournal: false },
        { id: 'a', createDate: 100, isJournal: false },
        { id: 'c', createDate: 300, isJournal: false },
      ])
    ).toBe('a');
  });

  test('prefers non-journal docs over older journals', () => {
    expect(
      pickParentDoc([
        { id: 'journal', createDate: 100, isJournal: true },
        { id: 'doc', createDate: 200, isJournal: false },
      ])
    ).toBe('doc');
  });

  test('falls back to journals when nothing else links to the doc', () => {
    expect(
      pickParentDoc([{ id: 'journal', createDate: 100, isJournal: true }])
    ).toBe('journal');
  });

  test('ranks docs without a create date last', () => {
    expect(
      pickParentDoc([
        { id: 'unknown', isJournal: false },
        { id: 'known', createDate: 100, isJournal: false },
      ])
    ).toBe('known');
  });

  test('is stable regardless of candidate order', () => {
    const candidates = [
      { id: 'b', createDate: 100, isJournal: false },
      { id: 'a', createDate: 100, isJournal: false },
    ];
    expect(pickParentDoc(candidates)).toBe('a');
    expect(pickParentDoc([...candidates].reverse())).toBe('a');
  });
});
