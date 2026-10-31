import { describe, expect, test } from 'vitest';

import { resolveTaskInteropTargetRow } from '../../../../blocks/database/src/database-block.js';

describe('task interop consumer resolution', () => {
  test('uses unique row identity match', () => {
    expect(
      resolveTaskInteropTargetRow({ status: 'unique', rowId: 'row-a' }, 'row-b')
    ).toBe('row-a');
  });

  test('falls back to event row only when missing', () => {
    expect(resolveTaskInteropTargetRow({ status: 'missing' }, 'row-b')).toBe(
      'row-b'
    );
  });

  test('does not fallback when identity is duplicated', () => {
    expect(
      resolveTaskInteropTargetRow(
        { status: 'duplicate', rowIds: ['row-a', 'row-b'] },
        'row-c'
      )
    ).toBeNull();
  });
});
