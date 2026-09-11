import { describe, expect, it } from 'vitest';

import { getChartLodLevel, LiveChartBudget } from './live-budget';

describe('live chart budget', () => {
  it('allows at most maxLive non-exempt instances', () => {
    const budget = new LiveChartBudget(3);
    expect(budget.acquire('a')).toBe(true);
    expect(budget.acquire('b')).toBe(true);
    expect(budget.acquire('c')).toBe(true);
    expect(budget.acquire('d')).toBe(false);
    expect(budget.acquire('e', true)).toBe(true);
    budget.release('a');
    expect(budget.acquire('d')).toBe(true);
    expect(budget.size).toBe(4);
  });

  it('uses L2 only when selected or hover+zoom > z1', () => {
    expect(getChartLodLevel(0.2, false, false)).toBe('l0');
    expect(getChartLodLevel(0.5, false, false)).toBe('l1');
    expect(getChartLodLevel(0.9, false, false)).toBe('l1');
    expect(getChartLodLevel(0.9, false, true)).toBe('l2');
    expect(getChartLodLevel(0.2, true, false)).toBe('l2');
  });
});
