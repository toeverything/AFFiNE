import { describe, expect, it } from 'vitest';

import { compareDateKeys } from '../core/group-by/compare-date-keys.js';

describe('compareDateKeys', () => {
  it('sorts relative keys ascending', () => {
    const cmp = compareDateKeys('date-relative', true);
    const keys = ['today', 'last7', 'yesterday', 'last30'];
    const sorted = [...keys].sort(cmp);
    expect(sorted).toEqual(['last30', 'last7', 'yesterday', 'today']);
  });

  it('sorts relative keys descending', () => {
    const cmp = compareDateKeys('date-relative', false);
    const keys = ['today', 'last7', 'yesterday', 'last30'];
    const sorted = [...keys].sort(cmp);
    expect(sorted).toEqual(['today', 'yesterday', 'last7', 'last30']);
  });

  it('sorts numeric keys correctly', () => {
    const asc = compareDateKeys('date-day', true);
    const desc = compareDateKeys('date-day', false);
    const keys = ['3', '1', '2'];
    expect([...keys].sort(asc)).toEqual(['1', '2', '3']);
    expect([...keys].sort(desc)).toEqual(['3', '2', '1']);
  });

  it('handles mixed relative and numeric keys', () => {
    const cmp = compareDateKeys('date-relative', true);
    const keys = ['today', '1', 'yesterday', '2'];
    const sorted = [...keys].sort(cmp);
    expect(sorted[0]).toBe('1');
    expect(sorted[sorted.length - 1]).toBe('today');
  });
});
