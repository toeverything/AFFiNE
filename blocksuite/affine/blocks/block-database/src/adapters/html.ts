import {
  type ColumnDataType,
  DatabaseBlockSchema,
  type SerializedCells,
} from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
  type InlineHtmlAST,
} from '@blocksuite/affine-shared/adapters';
import type { Element } from 'hast';

import { processTable } from './utils';

export const databaseBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: DatabaseBlockSchema.model.flavour,
  toMatch: () => false,
  fromMatch: o => o.node.flavour === DatabaseBlockSchema.model.flavour,
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext } = context;
      const columns = o.node.props.columns as Array<ColumnDataType>;
      const children = o.node.children;
      const cells = o.node.props.cells as SerializedCells;
      const table = processTable(columns, children, cells);
      const createAstTableCell = (
        children: InlineHtmlAST[]
      ): InlineHtmlAST => ({
        type: 'element',
        tagName: 'td',
        properties: Object.create(null),
        children,
      });

      const createAstTableHeaderCell = (
        children: InlineHtmlAST[]
      ): InlineHtmlAST => ({
        type: 'element',
        tagName: 'th',
        properties: Object.create(null),
        children,
      });

      const createAstTableRow = (cells: InlineHtmlAST[]): Element => ({
        type: 'element',
        tagName: 'tr',
        properties: Object.create(null),
        children: cells,
      });

      const { deltaConverter } = context;

      const tableHeaderAst: Element = {
        type: 'element',
        tagName: 'thead',
        properties: Object.create(null),
        children: [
          createAstTableRow(
            table.headers.map(v =>
              createAstTableHeaderCell([
                {
                  type: 'text',
                  value: v.name ?? '',
                },
              ])
            )
          ),
        ],
      };

      const tableBodyAst: Element = {
        type: 'element',
        tagName: 'tbody',
        properties: Object.create(null),
        children: table.rows.map(v => {
          return createAstTableRow(
            v.cells.map(cell => {
              return createAstTableCell(
                typeof cell.value === 'string'
                  ? [{ type: 'text', value: cell.value }]
                  : deltaConverter.deltaToAST(cell.value.delta)
              );
            })
          );
        }),
      };

      walkerContext
        .openNode({
          type: 'element',
          tagName: 'table',
          properties: Object.create(null),
          children: [tableHeaderAst, tableBodyAst],
        })
        .closeNode();

      walkerContext.skipAllChildren();
    },
  },
};

export const DatabaseBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  databaseBlockHtmlAdapterMatcher
);
