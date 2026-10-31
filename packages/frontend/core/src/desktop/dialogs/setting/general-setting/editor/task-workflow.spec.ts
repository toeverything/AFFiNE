import { describe, expect, test } from 'vitest';

import {
  parseTaskWorkflowColumns,
  parseTaskWorkflowFields,
  serializeTaskWorkflowFields,
} from './task-workflow-utils';

describe('task workflow settings parsing', () => {
  test('parses key and number type without rewriting while typing', () => {
    expect(parseTaskWorkflowFields('cost:number')).toEqual([
      { key: 'cost', type: 'number', label: 'cost' },
    ]);
  });

  test('parses optional labels and multiple fields', () => {
    expect(
      parseTaskWorkflowFields('cost:number:Cost, owner:text:Owner')
    ).toEqual([
      { key: 'cost', type: 'number', label: 'Cost' },
      { key: 'owner', type: 'text', label: 'Owner' },
    ]);
  });

  test('parses date field definitions', () => {
    expect(parseTaskWorkflowFields('due:date:Due')).toEqual([
      { key: 'due', type: 'date', label: 'Due' },
    ]);
  });

  test('parses select, multi-select, and progress field definitions', () => {
    expect(
      parseTaskWorkflowFields(
        'owner:select:Owner, tags:multi-select:Tags, done:progress:Done'
      )
    ).toEqual([
      { key: 'owner', type: 'select', label: 'Owner' },
      { key: 'tags', type: 'multi_select', label: 'Tags' },
      { key: 'done', type: 'progress', label: 'Done' },
    ]);
  });

  test('unknown field types still fall back to text', () => {
    expect(parseTaskWorkflowFields('owner:boolean:Owner')).toEqual([
      { key: 'owner', type: 'text', label: 'Owner' },
    ]);
  });

  test('rejects field keys with spaces and uses labels for display names', () => {
    expect(
      parseTaskWorkflowFields('multi_select:multi_select:Multi Select')
    ).toEqual([
      { key: 'multi_select', type: 'multi_select', label: 'Multi Select' },
    ]);
    expect(parseTaskWorkflowFields('Multi Select:multi_select')).toEqual([]);
  });

  test('deduplicates optional field keys by keeping the first definition', () => {
    expect(
      parseTaskWorkflowFields('owner:text:Owner, owner:select:Assignee')
    ).toEqual([{ key: 'owner', type: 'text', label: 'Owner' }]);
  });

  test('serializes committed fields in the editable format', () => {
    expect(
      serializeTaskWorkflowFields([
        { key: 'cost', type: 'number', label: 'Cost' },
        { key: 'owner', type: 'text', label: 'Owner' },
        { key: 'due', type: 'date', label: 'Due' },
        { key: 'tags', type: 'multi_select', label: 'Tags' },
      ])
    ).toBe(
      'cost:number:Cost, owner:text:Owner, due:date:Due, tags:multi_select:Tags'
    );
  });

  test('keeps default labels concise after commit', () => {
    expect(
      serializeTaskWorkflowFields([
        { key: 'cost', type: 'number', label: 'cost' },
      ])
    ).toBe('cost:number');
  });

  test('parses workflow columns with explicit semantics', () => {
    expect(
      parseTaskWorkflowColumns(
        'Todo:todo, In Progress:in_progress, Review:in-progress, Not Doing:none'
      )
    ).toEqual([
      'Todo:todo',
      'In Progress:in_progress',
      'Review:in_progress',
      'Not Doing:none',
    ]);
  });

  test('keeps labels when workflow semantics are missing or invalid', () => {
    expect(parseTaskWorkflowColumns('Draft, Review:later')).toEqual([
      'Draft',
      'Review',
    ]);
  });
});
