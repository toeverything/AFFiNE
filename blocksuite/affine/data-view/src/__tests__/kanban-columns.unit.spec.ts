import { describe, expect, it } from 'vitest';

import { materializeKanbanColumns } from '../view-presets/kanban/kanban-view-manager.js';

describe('kanban columns materialization', () => {
  it('appends missing properties while preserving existing order and state', () => {
    const columns = [{ id: 'status', hide: true }, { id: 'title' }];

    const next = materializeKanbanColumns(columns, ['title', 'status', 'date']);

    expect(next).toEqual([
      { id: 'status', hide: true },
      { id: 'title' },
      { id: 'date' },
    ]);
  });

  it('drops stale columns that no longer exist in data source', () => {
    const columns = [{ id: 'title' }, { id: 'removed', hide: true }];

    const next = materializeKanbanColumns(columns, ['title']);

    expect(next).toEqual([{ id: 'title' }]);
  });

  it('returns original reference when columns are already materialized', () => {
    const columns = [{ id: 'title' }, { id: 'status', hide: true }];

    const next = materializeKanbanColumns(columns, ['title', 'status']);

    expect(next).toBe(columns);
  });
});
