import { describe, expect, it } from 'vitest';

import { getBoardLodLevel, LiveKanbanBudget } from './live-budget';

describe('live kanban budget', () => {
  it('allows at most maxLiveKanban non-exempt boards', () => {
    const budget = new LiveKanbanBudget(2);
    expect(budget.acquire('a')).toBe(true);
    expect(budget.acquire('b')).toBe(true);
    expect(budget.acquire('c')).toBe(false);
    expect(budget.acquire('d', true)).toBe(true);
    budget.release('a');
    expect(budget.acquire('c')).toBe(true);
    expect(budget.size).toBe(3);
  });

  it('uses L2 only when selected or hover+zoom > z1', () => {
    expect(getBoardLodLevel(0.2, false, false)).toBe('l0');
    expect(getBoardLodLevel(0.5, false, false)).toBe('l1');
    expect(getBoardLodLevel(0.9, false, false)).toBe('l1');
    expect(getBoardLodLevel(0.9, false, true)).toBe('l2');
    expect(getBoardLodLevel(0.2, true, false)).toBe('l2');
  });
});
