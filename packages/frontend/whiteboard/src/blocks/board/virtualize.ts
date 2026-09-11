import { WHITEBOARD_LOD } from '../../const';

import type { BoardLodLevel } from './live-budget';

export type VirtualWindow = {
  start: number;
  end: number;
  offset: number;
  tail: number;
};

/**
 * Window items like data-view `table/pc-virtual`: estimate size + overscan,
 * render only the visible slice.
 */
export function windowRange(
  total: number,
  scrollOffset: number,
  viewportSize: number,
  itemSize: number,
  overscan = WHITEBOARD_LOD.virtualOverscan
): VirtualWindow {
  if (total <= 0 || itemSize <= 0) {
    return { start: 0, end: 0, offset: 0, tail: 0 };
  }
  const start = Math.max(0, Math.floor(scrollOffset / itemSize) - overscan);
  const visible = Math.ceil(viewportSize / itemSize) + overscan * 2;
  const end = Math.min(total, start + Math.max(visible, 1));
  return {
    start,
    end,
    offset: start * itemSize,
    tail: Math.max(0, (total - end) * itemSize),
  };
}

export function sliceWindow<T>(items: T[], range: VirtualWindow): T[] {
  return items.slice(range.start, range.end);
}

/** L0: no cards. L1: first N + overflow. L2: all (live data-view). */
export function sliceCards<T>(
  cards: T[],
  level: BoardLodLevel,
  limit = WHITEBOARD_LOD.l1KanbanCards
): { visible: T[]; overflow: number } {
  if (level === 'l0') {
    return { visible: [], overflow: cards.length };
  }
  if (level === 'l1') {
    const visible = cards.slice(0, limit);
    return { visible, overflow: Math.max(0, cards.length - visible.length) };
  }
  return { visible: cards, overflow: 0 };
}
