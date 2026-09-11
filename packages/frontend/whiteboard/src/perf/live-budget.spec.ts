import { describe, expect, it } from 'vitest';

import { LiveInstanceBudget } from './live-budget';

describe('LiveInstanceBudget', () => {
  it('caps non-exempt holders at maxLive', () => {
    const budget = new LiveInstanceBudget(2);
    expect(budget.acquire('a')).toBe(true);
    expect(budget.acquire('b')).toBe(true);
    expect(budget.acquire('c')).toBe(false);
    expect(budget.size).toBe(2);
  });

  it('does not count exempt holders against the cap', () => {
    const budget = new LiveInstanceBudget(1);
    expect(budget.acquire('a')).toBe(true);
    expect(budget.acquire('presentation', true)).toBe(true);
    expect(budget.size).toBe(2);
  });

  it('evicts the lowest-priority holder on a steal, not the oldest', () => {
    const budget = new LiveInstanceBudget(2);
    budget.acquire('high', false, { score: 900 });
    budget.acquire('low', false, { score: 10 });

    expect(budget.acquire('newcomer', false, { steal: true, score: 500 })).toBe(
      true
    );

    expect(budget.has('low')).toBe(false);
    expect(budget.has('high')).toBe(true);
    expect(budget.has('newcomer')).toBe(true);
  });

  it('refreshes the score of an existing holder', () => {
    const budget = new LiveInstanceBudget(2);
    budget.acquire('a', false, { score: 1 });
    budget.acquire('b', false, { score: 500 });
    // `a` is re-acquired with a higher score, so `b` becomes the weakest.
    budget.acquire('a', false, { score: 900 });

    budget.acquire('c', false, { steal: true, score: 700 });
    expect(budget.has('b')).toBe(false);
    expect(budget.has('a')).toBe(true);
  });

  it('releases exempt state together with the slot', () => {
    const budget = new LiveInstanceBudget(1);
    budget.acquire('a', true);
    budget.release('a');
    expect(budget.has('a')).toBe(false);
    expect(budget.acquire('b')).toBe(true);
  });
});
