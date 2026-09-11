import { describe, expect, it } from 'vitest';

import { sliceCards, windowRange } from './virtualize';

describe('kanban virtualization', () => {
  it('windows items with overscan like table/pc-virtual', () => {
    const range = windowRange(20, 160, 160, 40, 1);
    expect(range.start).toBe(3);
    expect(range.end).toBe(9);
    expect(range.offset).toBe(120);
    expect(range.tail).toBe(440);
  });

  it('shows no cards on L0 and first N plus overflow on L1', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'];
    expect(sliceCards(cards, 'l0')).toEqual({ visible: [], overflow: 5 });
    expect(sliceCards(cards, 'l1', 3)).toEqual({
      visible: ['a', 'b', 'c'],
      overflow: 2,
    });
    expect(sliceCards(cards, 'l2', 3)).toEqual({
      visible: cards,
      overflow: 0,
    });
  });
});
