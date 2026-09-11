import { describe, expect, it } from 'vitest';

import { getSketchLodLevel, LiveSketchBudget } from './live-budget';

describe('live sketch budget', () => {
  it('allows at most maxLiveSketches non-exempt editors', () => {
    const budget = new LiveSketchBudget(1);
    expect(budget.acquire('a')).toBe(true);
    expect(budget.acquire('b')).toBe(false);
    expect(budget.acquire('c', true)).toBe(true);
    budget.release('a');
    expect(budget.acquire('b')).toBe(true);
  });

  it('steals the live slot when entering another sketch', () => {
    const budget = new LiveSketchBudget(1);
    expect(budget.acquire('a')).toBe(true);
    expect(budget.acquire('b', false, true)).toBe(true);
    expect(budget.has('a')).toBe(false);
    expect(budget.has('b')).toBe(true);
  });

  it('uses L2 only when selected or hover+zoom > z1', () => {
    expect(getSketchLodLevel(0.2, false, false)).toBe('l0');
    expect(getSketchLodLevel(0.5, false, false)).toBe('l1');
    expect(getSketchLodLevel(0.9, false, true)).toBe('l2');
    expect(getSketchLodLevel(0.2, true, false)).toBe('l2');
  });
});
