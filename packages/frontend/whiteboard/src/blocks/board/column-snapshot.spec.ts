import { describe, expect, it } from 'vitest';

import { readBoardColumns } from './column-snapshot';

describe('board column snapshot', () => {
  it('groups cards by select options and preserves manual order', () => {
    const columns = readBoardColumns({
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
      ],
      cells: {
        r2: { status: { value: 'todo' } },
        r1: { status: { value: 'todo' } },
        r3: { status: { value: 'done' } },
      },
      views: [
        {
          id: 'kanban',
          mode: 'kanban',
          groupBy: { columnId: 'status', hideEmpty: false },
          groupProperties: [
            { key: 'todo', manuallyCardSort: ['r1', 'r2'] },
            { key: 'done', manuallyCardSort: [] },
          ],
        },
      ],
      rows: [
        { id: 'r2', title: 'Second' },
        { id: 'r1', title: 'First' },
        { id: 'r3', title: 'Done card' },
      ],
    });

    expect(columns.map(column => column.name)).toEqual(['To do', 'Done']);
    expect(columns[0]?.cards.map(card => card.id)).toEqual(['r1', 'r2']);
    expect(columns[0]?.count).toBe(2);
    expect(columns[1]?.count).toBe(1);
  });

  it('hides empty groups when hideEmpty is set', () => {
    const columns = readBoardColumns({
      columns: [
        {
          id: 'status',
          type: 'select',
          name: 'Status',
          data: {
            options: [
              { id: 'todo', value: 'To do' },
              { id: 'done', value: 'Done' },
            ],
          },
        },
      ],
      cells: {
        r1: { status: { value: 'todo' } },
      },
      views: [
        {
          id: 'kanban',
          mode: 'kanban',
          groupBy: { columnId: 'status', hideEmpty: true },
        },
      ],
      rows: [{ id: 'r1', title: 'Task' }],
    });

    expect(columns.map(column => column.id)).toEqual(['todo']);
  });
});
