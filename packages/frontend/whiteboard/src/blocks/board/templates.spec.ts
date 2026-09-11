import { describe, expect, it } from 'vitest';

import {
  columnsForTemplate,
  isBoardTemplate,
  PROJECT_COLUMNS,
  TODO_COLUMNS,
  TODO_STATUS_OPTIONS,
} from './types';

describe('wb:board templates', () => {
  it('seeds a To do / In progress / Done status column', () => {
    expect(columnsForTemplate('todo')).toEqual(TODO_COLUMNS);
    expect(TODO_STATUS_OPTIONS.map(option => option.value)).toEqual([
      'To do',
      'In progress',
      'Done',
    ]);
  });

  it('seeds project tracking columns already supported by data-view', () => {
    const names = columnsForTemplate('project').map(column => column.name);
    expect(names).toEqual([
      'Status',
      'Assignee',
      'Due',
      'Labels',
      'Cover',
      'Time spent',
      'Started',
      'Files',
    ]);
    expect(PROJECT_COLUMNS.some(column => column.type === 'number')).toBe(true);
    expect(PROJECT_COLUMNS.some(column => column.type === 'attachment')).toBe(
      true
    );
    expect(PROJECT_COLUMNS.some(column => column.type === 'member')).toBe(true);
    expect(PROJECT_COLUMNS.some(column => column.type === 'date')).toBe(true);
    expect(PROJECT_COLUMNS.some(column => column.type === 'multi-select')).toBe(
      true
    );
    expect(PROJECT_COLUMNS.some(column => column.type === 'image')).toBe(true);
  });

  it('accepts only known template ids', () => {
    expect(isBoardTemplate('todo')).toBe(true);
    expect(isBoardTemplate('project')).toBe(true);
    expect(isBoardTemplate('swimlane')).toBe(true);
  });
});
