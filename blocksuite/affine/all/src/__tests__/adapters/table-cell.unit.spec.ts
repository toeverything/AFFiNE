import { TableModelFlavour } from '@blocksuite/affine-model';
import {
  MarkdownAdapter,
  PlainTextAdapter,
} from '@blocksuite/affine-shared/adapters';
import type { BlockSnapshot } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';

import { createJob } from '../utils/create-job.js';
import { getProvider } from '../utils/get-provider.js';

const provider = getProvider();

const deltaText = (insert: string) => ({
  '$blocksuite:internal:text$': true,
  delta: insert ? [{ insert }] : [],
});

const tableSnapshot = (cells: Record<string, unknown>): BlockSnapshot => ({
  type: 'block',
  id: 'table',
  flavour: TableModelFlavour,
  props: {
    columns: {
      c1: { columnId: 'c1', order: 'a0' },
      c2: { columnId: 'c2', order: 'a1' },
    },
    rows: {
      r1: { rowId: 'r1', order: 'a0' },
      r2: { rowId: 'r2', order: 'a1' },
    },
    cells,
  },
  children: [],
});

const expectedSnapshot = tableSnapshot({
  'r1:c1': { text: deltaText('name') },
  'r1:c2': { text: deltaText('value') },
  'r2:c1': { text: deltaText('plain') },
  'r2:c2': { text: deltaText('') },
});

describe('table cells without a delta', () => {
  test.each([
    { name: 'markdown', Adapter: MarkdownAdapter },
    { name: 'plain text', Adapter: PlainTextAdapter },
  ])(
    'export to $name like delta cells when a cell text is a string or missing',
    async ({ Adapter }) => {
      const adapter = new Adapter(createJob(), provider);
      const expected = await adapter.fromBlockSnapshot({
        snapshot: expectedSnapshot,
      });

      const target = await adapter.fromBlockSnapshot({
        snapshot: tableSnapshot({
          'r1:c1': { text: deltaText('name') },
          'r1:c2': { text: deltaText('value') },
          'r2:c1': { text: 'plain' },
          'r2:c2': {},
        }),
      });

      expect(target.file).toContain('plain');
      expect(target.file).toBe(expected.file);
    }
  );
});
