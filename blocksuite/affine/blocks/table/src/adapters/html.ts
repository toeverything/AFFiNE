import {
  type TableBlockPropsSerialized,
  TableBlockSchema,
  TableModelFlavour,
} from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
  HastUtils,
  type InlineHtmlAST,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';
import type { Element } from 'hast';

import { DefaultColumnWidth } from '../consts';
import { parseTableFromHtml, processTable } from './utils';

const TABLE_NODE_TYPES = new Set(['table', 'thead', 'tbody', 'th', 'tr']);

export const tableBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: TableBlockSchema.model.flavour,
  toMatch: o => {
    return HastUtils.isElement(o.node) && TABLE_NODE_TYPES.has(o.node.tagName);
  },
  fromMatch: o => o.node.flavour === TableBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const { walkerContext } = context;
      if (o.node.tagName === 'table') {
        const astToDelta = context.deltaConverter.astToDelta.bind(
          context.deltaConverter
        );
        const tableProps = parseTableFromHtml(o.node, astToDelta);
        walkerContext.openNode(
          {
            type: 'block',
            id: nanoid(),
            flavour: TableModelFlavour,
            props: tableProps as unknown as Record<string, unknown>,
            children: [],
          },
          'children'
        );
        walkerContext.skipAllChildren();
      }
    },
    leave: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const { walkerContext } = context;
      if (o.node.tagName === 'table') {
        walkerContext.closeNode();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext } = context;
      const { columns, rows, cells } = o.node
        .props as unknown as TableBlockPropsSerialized;
      const table = processTable(columns, rows, cells);
      const createAstTableCell = (
        children: InlineHtmlAST[]
      ): InlineHtmlAST => ({
        type: 'element',
        tagName: 'td',
        properties: Object.create(null),
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: {
              style: `min-height: 22px;min-width:${DefaultColumnWidth}px;padding: 8px 12px;`,
            },
            children,
          },
        ],
      });

      const createAstTableRow = (cells: InlineHtmlAST[]): Element => ({
        type: 'element',
        tagName: 'tr',
        properties: Object.create(null),
        children: cells,
      });

      const { deltaConverter } = context;

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
          properties: {
            border: true,
            style: 'border-collapse: collapse;border-spacing: 0;',
          },
          children: [tableBodyAst],
        })
        .closeNode();

      walkerContext.skipAllChildren();
    },
  },
};

export const TableBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  tableBlockHtmlAdapterMatcher
);
