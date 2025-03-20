import {
  type TableBlockPropsSerialized,
  TableBlockSchema,
  TableModelFlavour,
} from '@blocksuite/affine-model';
import {
  BlockPlainTextAdapterExtension,
  type BlockPlainTextAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';

import { createTableProps, formatTable, processTable } from './utils.js';

export const tableBlockPlainTextAdapterMatcher: BlockPlainTextAdapterMatcher = {
  flavour: TableBlockSchema.model.flavour,
  toMatch: () => true,
  fromMatch: o => o.node.flavour === TableBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext } = context;
      const text = o.node.content;
      const rowTexts = text.split('\n');
      if (rowTexts.length <= 1) return;
      const rowTextLists: DeltaInsert[][][] = [];
      let columnCount: number | null = null;
      for (const row of rowTexts) {
        const cells = row.split('\t').map<DeltaInsert[]>(text => [
          {
            insert: text,
          },
        ]);
        if (cells.length <= 1) return;
        if (columnCount == null) {
          columnCount = cells.length;
        } else if (columnCount !== cells.length) {
          return;
        }
        rowTextLists.push(cells);
      }
      const tableProps = createTableProps(rowTextLists);
      walkerContext.openNode({
        type: 'block',
        id: nanoid(),
        flavour: TableModelFlavour,
        props: tableProps,
        children: [],
      });
      walkerContext.skipAllChildren();
    },
    leave: (_, context) => {
      const { walkerContext } = context;
      walkerContext.closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext, deltaConverter } = context;
      const result: string[][] = [];
      const { columns, rows, cells } = o.node
        .props as unknown as TableBlockPropsSerialized;
      const table = processTable(columns, rows, cells);
      table.rows.forEach(v => {
        result.push(
          v.cells.map(v => deltaConverter.deltaToAST(v.value.delta).join(''))
        );
      });

      const tableString = formatTable(result);

      context.textBuffer.content += tableString;
      context.textBuffer.content += '\n';
      walkerContext.skipAllChildren();
    },
  },
};

export const TableBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(tableBlockPlainTextAdapterMatcher);
