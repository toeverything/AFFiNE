import { describe, expect, it } from 'vitest';

import { WHITEBOARD_LOD } from '../../const';
import { sliceCards, windowCards, windowRange } from './virtualize';

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

  it('keeps the L0/L1 slice when a column body does not scroll', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'];
    expect(windowCards(cards, 'l0')).toEqual({
      visible: [],
      overflow: 5,
      offset: 0,
      tail: 0,
    });
    expect(windowCards(cards, 'l1', undefined, 2)).toEqual({
      visible: ['a', 'b'],
      overflow: 3,
      offset: 0,
      tail: 0,
    });
    expect(windowCards(cards, 'l2')).toEqual({
      visible: cards,
      overflow: 0,
      offset: 0,
      tail: 0,
    });
  });

  it('windows L2 cards by the column scroll offset with spacers', () => {
    const size = WHITEBOARD_LOD.kanbanCardEstimatePx;
    const cards = Array.from({ length: 100 }, (_, index) => `card-${index}`);
    const window = windowCards(cards, 'l2', {
      offset: size * 10,
      viewport: size * 4,
    });

    expect(window.overflow).toBe(0);
    expect(window.visible[0]).toBe('card-9');
    expect(window.visible).toHaveLength(6);
    expect(window.offset).toBe(size * 9);
    expect(window.offset + window.visible.length * size + window.tail).toBe(
      cards.length * size
    );
  });

  it('stops the L2 window at the last card', () => {
    const size = WHITEBOARD_LOD.kanbanCardEstimatePx;
    const cards = ['a', 'b', 'c'];
    const window = windowCards(cards, 'l2', {
      offset: size * 2,
      viewport: size * 4,
    });

    expect(window.visible).toEqual(['b', 'c']);
    expect(window.tail).toBe(0);
  });
});
