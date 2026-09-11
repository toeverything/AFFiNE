import { describe, expect, it } from 'vitest';

import { cardsInColumn, readBoardGrid } from './grid';
import { isWipExceeded } from './semantics';

describe('board swimlane grid', () => {
  it('places a card in a column × lane cell', () => {
    const grid = readBoardGrid({
      columns: [
        {
          id: 'status',
          type: 'select',
          name: 'Status',
          data: {
            options: [
              { id: 'todo', value: 'To do', color: 'orange' },
              { id: 'done', value: 'Done', color: 'green' },
            ],
          },
        },
        { id: 'member', type: 'member', name: 'Assignee' },
      ],
      cells: {
        r1: {
          status: { value: 'todo' },
          member: { value: ['alice'] },
        },
        r2: {
          status: { value: 'todo' },
          member: { value: ['bob'] },
        },
      },
      views: [
        {
          id: 'k',
          mode: 'kanban',
          groupBy: { columnId: 'status' },
          groupByAxes: { x: 'status', y: 'member' },
          wipLimits: { todo: 1 },
        },
      ],
      rows: [
        { id: 'r1', title: 'One', tasks: [{ text: 'x', done: true }] },
        { id: 'r2', title: 'Two' },
      ],
    });

    expect(grid.lanes.map(lane => lane.id)).toEqual(['alice', 'bob', '']);
    const aliceTodo = grid.cells.find(
      cell => cell.x === 'todo' && cell.y === 'alice'
    );
    expect(aliceTodo?.cards.map(card => card.id)).toEqual(['r1']);
    expect(aliceTodo?.cards[0]?.checklist).toEqual({ done: 1, total: 1 });
    expect(cardsInColumn(grid, 'todo')).toBe(2);
    expect(isWipExceeded(cardsInColumn(grid, 'todo'), grid.wipLimits.todo)).toBe(
      true
    );
  });
});
