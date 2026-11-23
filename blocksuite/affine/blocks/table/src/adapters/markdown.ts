import {
  type TableBlockPropsSerialized,
  TableBlockSchema,
  TableModelFlavour,
} from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';
import type { TableRow } from 'mdast';

import { parseTableFromMarkdown, processTable } from './utils';

const TABLE_NODE_TYPES = new Set(['table', 'tableRow']);

const isTableNode = (node: MarkdownAST) => TABLE_NODE_TYPES.has(node.type);

export const tableBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: TableBlockSchema.model.flavour,
  toMatch: o => isTableNode(o.node),
  fromMatch: o => o.node.flavour === TableBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext } = context;
      if (o.node.type === 'table') {
        const astToDelta = context.deltaConverter.astToDelta.bind(
          context.deltaConverter
        );
        walkerContext.openNode(
          {
            type: 'block',
            id: nanoid(),
            flavour: TableModelFlavour,
            props: parseTableFromMarkdown(o.node, astToDelta),
            children: [],
          },
          'children'
        );
        walkerContext.skipAllChildren();
      }
    },
    leave: (o, context) => {
      const { walkerContext } = context;
      if (o.node.type === 'table') {
        walkerContext.closeNode();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext, deltaConverter } = context;
      const { columns, rows, cells } = o.node
        .props as unknown as TableBlockPropsSerialized;
      const table = processTable(columns, rows, cells);
      const result: TableRow[] = [];
      table.rows.forEach(v => {
        result.push({
          type: 'tableRow',
          children: v.cells.map(v => ({
            type: 'tableCell',
            children: deltaConverter.deltaToAST(v.value.delta),
          })),
        });
      });

      walkerContext
        .openNode({
          type: 'table',
          children: result,
        })
        .closeNode();

      walkerContext.skipAllChildren();
    },
  },
};

export const TableBlockMarkdownAdapterExtension = BlockMarkdownAdapterExtension(
  tableBlockMarkdownAdapterMatcher
);
