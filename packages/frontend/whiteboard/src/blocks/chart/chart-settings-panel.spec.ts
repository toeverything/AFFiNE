import { describe, expect, it } from 'vitest';

import { inlineRowsToText, parseInlineRows } from './chart-settings-panel';
import { INLINE_CELL_LIMIT } from './mapping';

describe('chart inline editor', () => {
  it('round-trips quoted cells through the textarea', () => {
    const table = {
      columns: ['City', 'Value'],
      rows: [['New York, NY', 10] as Array<string | number | null>],
    };
    const text = inlineRowsToText(table);

    expect(text).toBe('"New York, NY",10');
    expect(parseInlineRows(table.columns, text)).toEqual(table);
  });

  it('caps the stored rows at the inline cell limit', () => {
    const text = Array.from({ length: 300 }, (_, index) => `r${index},1`).join(
      '\n'
    );
    const table = parseInlineRows(['Name', 'Value'], text);

    expect(table.rows.length).toBe(INLINE_CELL_LIMIT / 2);
  });

  it('takes columns from the first line when none are stored', () => {
    const table = parseInlineRows([], 'City,Value\nParis,7');

    expect(table.columns).toEqual(['City', 'Value']);
    expect(table.rows).toEqual([['Paris', 7]]);
  });
});
