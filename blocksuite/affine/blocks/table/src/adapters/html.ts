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
import { parseTableFromHtml } from './utils';

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

      const sortedColumns = Object.values(columns).sort((a, b) =>
        a.order.localeCompare(b.order)
      );
      const sortedRows = Object.values(rows).sort((a, b) =>
        a.order.localeCompare(b.order)
      );

      const createAstTableCell = (
        children: InlineHtmlAST[],
        colSpan: number,
        rowSpan: number,
        textAlign: string | undefined
      ): InlineHtmlAST => {
        const divStyle = [
          `min-height: 22px;min-width:${DefaultColumnWidth}px;padding: 8px 12px;`,
          textAlign ? `text-align: ${textAlign};` : '',
        ]
          .filter(Boolean)
          .join('');
        return {
          type: 'element',
          tagName: 'td',
          properties: {
            ...(colSpan > 1 ? { colSpan } : {}),
            ...(rowSpan > 1 ? { rowSpan } : {}),
          },
          children: [
            {
              type: 'element',
              tagName: 'div',
              properties: { style: divStyle },
              children,
            },
          ],
        };
      };

      const createAstTableRow = (tdNodes: InlineHtmlAST[]): Element => ({
        type: 'element',
        tagName: 'tr',
        properties: Object.create(null),
        children: tdNodes,
      });

      const { deltaConverter } = context;

      const tableBodyAst: Element = {
        type: 'element',
        tagName: 'tbody',
        properties: Object.create(null),
        children: sortedRows.map(row => {
          const tdNodes = sortedColumns
            .map(col => {
              const rawCell = cells[`${row.rowId}:${col.columnId}`];
              if (rawCell?.hidden) return null;
              const delta = rawCell?.text?.delta ?? [];
              return createAstTableCell(
                delta.length
                  ? deltaConverter.deltaToAST(delta)
                  : [{ type: 'text', value: '' }],
                rawCell?.colSpan ?? 1,
                rawCell?.rowSpan ?? 1,
                rawCell?.textAlign
              );
            })
            .filter((c): c is InlineHtmlAST => c !== null);
          return createAstTableRow(tdNodes);
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
