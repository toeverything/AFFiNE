import { describe, expect, it } from 'vitest';

import {
  inferMapping,
  limitCells,
  mapDatabaseToDataset,
  mapInlineTable,
  parseCsv,
} from './mapping';

describe('chart mapping', () => {
  it('maps an inline table through x/y columns', () => {
    const dataset = mapInlineTable(
      {
        columns: ['Month', 'Revenue', 'Cost'],
        rows: [
          ['Jan', 10, 4],
          ['Feb', 12, 5],
        ],
      },
      { x: 'Month', y: ['Revenue'] }
    );

    expect(dataset.dimensions).toEqual(['Month', 'Revenue']);
    expect(dataset.source).toEqual([
      ['Jan', 10],
      ['Feb', 12],
    ]);
  });

  it('maps database cells by column id or name', () => {
    const dataset = mapDatabaseToDataset(
      {
        columns: [
          { id: 'c1', name: 'Sprint' },
          { id: 'c2', name: 'Points', type: 'number' },
        ],
        rows: [
          { id: 'r1', title: 'A', cells: { c1: 'S1', c2: 8 } },
          { id: 'r2', title: 'B', cells: { c1: 'S2', c2: '13' } },
        ],
      },
      { x: 'Sprint', y: ['c2'] }
    );

    expect(dataset.dimensions).toEqual(['Sprint', 'Points']);
    expect(dataset.source).toEqual([
      ['S1', 8],
      ['S2', 13],
    ]);
  });

  it('infers x as the first non-numeric column', () => {
    expect(
      inferMapping(
        [
          { id: 'name', name: 'Name', type: 'title' },
          { id: 'n', name: 'N', type: 'number' },
        ],
        { name: 'Alpha', n: 3 }
      )
    ).toEqual({ x: 'name', y: ['n'] });
  });

  it('parses csv with quotes and caps cell count', () => {
    const table = parseCsv('City,Value\n"New York",10\nParis,7\n');
    expect(table.columns).toEqual(['City', 'Value']);
    expect(table.rows[0]).toEqual(['New York', 10]);

    const limited = limitCells(
      ['a', 'b'],
      Array.from({ length: 300 }, () => [1, 2])
    );
    expect(limited.length).toBe(100);
  });
});
