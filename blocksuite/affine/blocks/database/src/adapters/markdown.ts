import {
  type ColumnDataType,
  DatabaseBlockSchema,
  type SerializedCells,
} from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import type { TableRow } from 'mdast';

import { processTable } from './utils';

const DATABASE_NODE_TYPES = new Set(['table', 'tableRow']);

const isDatabaseNode = (node: MarkdownAST) =>
  DATABASE_NODE_TYPES.has(node.type);

export const databaseBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher =
  {
    flavour: DatabaseBlockSchema.model.flavour,
    toMatch: o => isDatabaseNode(o.node),
    fromMatch: o => o.node.flavour === DatabaseBlockSchema.model.flavour,
    toBlockSnapshot: {},
    fromBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext, deltaConverter } = context;
        const rows: TableRow[] = [];
        const columns = o.node.props.columns as Array<ColumnDataType>;
        const children = o.node.children;
        const cells = o.node.props.cells as SerializedCells;
        const table = processTable(columns, children, cells);
        rows.push({
          type: 'tableRow',
          children: table.headers.map(v => ({
            type: 'tableCell',
            children: [{ type: 'text', value: v.name }],
          })),
        });
        table.rows.forEach(v => {
          rows.push({
            type: 'tableRow',
            children: v.cells.map(v => ({
              type: 'tableCell',
              children:
                typeof v.value === 'string'
                  ? [{ type: 'text', value: v.value }]
                  : deltaConverter.deltaToAST(v.value.delta),
            })),
          });
        });

        walkerContext
          .openNode({
            type: 'table',
            children: rows,
          })
          .closeNode();

        walkerContext.skipAllChildren();
      },
    },
  };

export const DatabaseBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(databaseBlockMarkdownAdapterMatcher);
