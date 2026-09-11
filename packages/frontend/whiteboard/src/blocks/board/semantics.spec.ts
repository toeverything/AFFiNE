import { describe, expect, it } from 'vitest';

import {
  accumulateMinutes,
  attachmentCount,
  checklistProgress,
  formatMinutes,
  isWipExceeded,
  laneValue,
  moveCardCells,
  parseTasks,
  readGroupByAxes,
  toggleTask,
} from './semantics';

describe('board planka semantics', () => {
  it('parses checklist cells and toggles items', () => {
    const tasks = parseTasks(
      JSON.stringify([
        { text: 'A', done: false },
        { text: 'B', done: true },
      ])
    );
    expect(checklistProgress(tasks)).toEqual({ done: 1, total: 2 });
    expect(toggleTask(tasks, 0)[0]?.done).toBe(true);
  });

  it('flags WIP overflow only when a positive limit is exceeded', () => {
    expect(isWipExceeded(3, 3)).toBe(false);
    expect(isWipExceeded(4, 3)).toBe(true);
    expect(isWipExceeded(10, undefined)).toBe(false);
  });

  it('reads groupBy { x, y } without breaking kanban columnId', () => {
    expect(
      readGroupByAxes({
        groupBy: { columnId: 'status', x: 'status', y: 'assignee' },
      })
    ).toEqual({ x: 'status', y: 'assignee' });
    expect(readGroupByAxes({ groupByY: { columnId: 'member' } })).toEqual({
      x: undefined,
      y: 'member',
    });
  });

  it('moves a card by writing two cell properties (LWW on values)', () => {
    const next = moveCardCells(
      { r1: { status: { value: 'todo' }, member: { value: ['u1'] } } },
      'r1',
      {
        xPropertyId: 'status',
        xValue: 'done',
        yPropertyId: 'member',
        yValue: 'u2',
        yIsMember: true,
      }
    );
    expect((next.r1?.status as { value?: unknown }).value).toBe('done');
    expect((next.r1?.member as { value?: unknown }).value).toEqual(['u2']);
  });

  it('formats time spent and accumulates a running stopwatch', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(accumulateMinutes(10, Date.now() - 5 * 60000, Date.now())).toBe(15);
    expect(attachmentCount({ a: { name: 'x' }, b: { name: 'y' } })).toBe(2);
    expect(laneValue(['u1', 'u2'])).toBe('u1');
  });
});
