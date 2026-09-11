import { describe, expect, it } from 'vitest';

import { mermaidToInlineTable } from './mermaid';

describe('mermaid → chart', () => {
  it('parses pie and xychart-beta into an inline table', () => {
    expect(
      mermaidToInlineTable(`pie title Pets
"Dogs": 40
"Cats": 25
`)
    ).toEqual({
      columns: ['label', 'value'],
      rows: [
        ['Dogs', 40],
        ['Cats', 25],
      ],
    });

    expect(
      mermaidToInlineTable(`xychart-beta
    x-axis [Q1, Q2, Q3]
    bar [10, 20, 15]
`)
    ).toEqual({
      columns: ['x', 'y'],
      rows: [
        ['Q1', 10],
        ['Q2', 20],
        ['Q3', 15],
      ],
    });
  });
});
