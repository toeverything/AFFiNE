import {
  type ColumnDataType,
  DatabaseBlockSchema,
  type SerializedCells,
} from '@blocksuite/affine-model';
import {
  BlockPlainTextAdapterExtension,
  type BlockPlainTextAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';

import { formatTable, processTable } from './utils.js';

export const databaseBlockPlainTextAdapterMatcher: BlockPlainTextAdapterMatcher =
  {
    flavour: DatabaseBlockSchema.model.flavour,
    toMatch: () => false,
    fromMatch: o => o.node.flavour === DatabaseBlockSchema.model.flavour,
    toBlockSnapshot: {},
    fromBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext, deltaConverter } = context;
        const rows: string[][] = [];
        const columns = o.node.props.columns as Array<ColumnDataType>;
        const children = o.node.children;
        const cells = o.node.props.cells as SerializedCells;
        const table = processTable(columns, children, cells);
        rows.push(table.headers.map(v => v.name));
        table.rows.forEach(v => {
          rows.push(
            v.cells.map(v =>
              typeof v.value === 'string'
                ? v.value
                : deltaConverter.deltaToAST(v.value.delta).join('')
            )
          );
        });

        const tableString = formatTable(rows);

        context.textBuffer.content += tableString;
        context.textBuffer.content += '\n';
        walkerContext.skipAllChildren();
      },
    },
  };

export const DatabaseBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(databaseBlockPlainTextAdapterMatcher);
