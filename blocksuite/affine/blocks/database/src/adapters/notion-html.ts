import { DatabaseBlockSchema } from '@blocksuite/affine-model';
import {
  AdapterTextUtils,
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { getTagColor } from '@blocksuite/data-view';
import { type BlockSnapshot, nanoid } from '@blocksuite/store';

const ColumnClassMap: Record<string, string> = {
  typesSelect: 'select',
  typesMultipleSelect: 'multi-select',
  typesNumber: 'number',
  typesCheckbox: 'checkbox',
  typesText: 'rich-text',
  typesTitle: 'title',
  typesDate: 'date',
};

const NotionDatabaseToken = '.collection-content';
const NotionDatabaseTitleToken = '.collection-title';

type BlocksuiteTableColumn = {
  type: string;
  name: string;
  data: {
    options?: {
      id: string;
      value: string;
      color: string;
    }[];
  };
  id: string;
};

type BlocksuiteTableRow = Record<
  string,
  {
    columnId: string;
    value: unknown;
  }
>;

const DATABASE_NODE_TYPES = new Set(['table', 'th', 'tr']);

export const databaseBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: DatabaseBlockSchema.model.flavour,
    toMatch: o =>
      HastUtils.isElement(o.node) && DATABASE_NODE_TYPES.has(o.node.tagName),
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const { walkerContext, deltaConverter, pageMap } = context;
        switch (o.node.tagName) {
          case 'th': {
            const columnId = nanoid();
            const columnTypeClass = HastUtils.querySelector(o.node, 'svg')
              ?.properties?.className;
            const columnType = Array.isArray(columnTypeClass)
              ? (ColumnClassMap[columnTypeClass[0] ?? ''] ?? 'rich-text')
              : 'rich-text';
            walkerContext.pushGlobalContextStack<BlocksuiteTableColumn>(
              'hast:table:column',
              {
                type: columnType,
                name: HastUtils.getTextContent(
                  HastUtils.getTextChildrenOnlyAst(o.node)
                ),
                data: Object.create(null),
                id: columnId,
              }
            );
            // disable icon img in th
            walkerContext.setGlobalContext('hast:disableimg', true);
            break;
          }
          case 'tr': {
            if (
              o.parent?.node.type === 'element' &&
              o.parent.node.tagName === 'tbody'
            ) {
              const columns =
                walkerContext.getGlobalContextStack<BlocksuiteTableColumn>(
                  'hast:table:column'
                );
              const row = Object.create(null);
              let plainTable = false;
              HastUtils.getElementChildren(o.node).forEach((child, index) => {
                if (plainTable || columns[index] === undefined) {
                  plainTable = true;
                  if (columns[index] === undefined) {
                    columns.push({
                      type: 'rich-text',
                      name: '',
                      data: Object.create(null),
                      id: nanoid(),
                    });
                    walkerContext.pushGlobalContextStack<BlockSnapshot>(
                      'hast:table:children',
                      {
                        type: 'block',
                        id: nanoid(),
                        flavour: 'affine:paragraph',
                        props: {
                          text: {
                            '$blocksuite:internal:text$': true,
                            delta: deltaConverter.astToDelta(child),
                          },
                          type: 'text',
                        },
                        children: [],
                      }
                    );
                  }
                  walkerContext.pushGlobalContextStack<BlockSnapshot>(
                    'hast:table:children',
                    {
                      type: 'block',
                      id: nanoid(),
                      flavour: 'affine:paragraph',
                      props: {
                        text: {
                          '$blocksuite:internal:text$': true,
                          delta: deltaConverter.astToDelta(child),
                        },
                        type: 'text',
                      },
                      children: [],
                    }
                  );
                  const column = columns[index];
                  if (!column) {
                    return;
                  }
                  row[column.id] = {
                    columnId: column.id,
                    value: HastUtils.getTextContent(child),
                  };
                } else if (HastUtils.querySelector(child, '.cell-title')) {
                  walkerContext.pushGlobalContextStack<BlockSnapshot>(
                    'hast:table:children',
                    {
                      type: 'block',
                      id: nanoid(),
                      flavour: 'affine:paragraph',
                      props: {
                        text: {
                          '$blocksuite:internal:text$': true,
                          delta: deltaConverter.astToDelta(child, { pageMap }),
                        },
                        type: 'text',
                      },
                      children: [],
                    }
                  );
                  columns[index].type = 'title';
                  return;
                }
                const optionIds: string[] = [];
                const column = columns[index];
                if (!column) {
                  return;
                }

                // Check for <time> element to find date field from Notion.
                if (HastUtils.querySelector(child, 'time')) {
                  const timeElement = HastUtils.querySelector(child, 'time');
                  let rawColumnData =
                    HastUtils.getTextContent(timeElement).trim();

                  if (rawColumnData.startsWith('@')) {
                    rawColumnData = rawColumnData.slice(1);
                  }

                  const columnDate = new Date(rawColumnData);
                  const timestamp = columnDate.getTime();

                  if (!Number.isNaN(timestamp)) {
                    column.data = {};
                    if (column.type !== 'date') {
                      column.type = 'date';
                    }
                    row[column.id] = {
                      columnId: column.id,
                      value: timestamp,
                    };
                  } else {
                    row[column.id] = {
                      columnId: column.id,
                      value: HastUtils.getTextContent(child),
                    };
                  }
                } else if (HastUtils.querySelector(child, '.selected-value')) {
                  if (!('options' in column.data)) {
                    column.data.options = [];
                  }
                  if (!['multi-select', 'select'].includes(column.type)) {
                    column.type = 'select';
                  }
                  if (
                    column.type === 'select' &&
                    child.type === 'element' &&
                    child.children.length > 1
                  ) {
                    column.type = 'multi-select';
                  }
                  child.type === 'element' &&
                    child.children.forEach(span => {
                      const filteredArray = column.data.options?.filter(
                        option =>
                          option.value === HastUtils.getTextContent(span)
                      );
                      const id = filteredArray?.length
                        ? (filteredArray[0]?.id ?? nanoid())
                        : nanoid();
                      if (!filteredArray?.length) {
                        column.data.options?.push({
                          id,
                          value: HastUtils.getTextContent(span),
                          color: getTagColor(),
                        });
                      }
                      optionIds.push(id);
                    });
                  // Expand will be done when leaving the table
                  row[column.id] = {
                    columnId: column.id,
                    value: optionIds,
                  };
                } else if (HastUtils.querySelector(child, '.checkbox')) {
                  if (column.type !== 'checkbox') {
                    column.type = 'checkbox';
                  }
                  row[column.id] = {
                    columnId: column.id,
                    value: HastUtils.querySelector(child, '.checkbox-on')
                      ? true
                      : false,
                  };
                } else if (column.type === 'number') {
                  const text = HastUtils.getTextContent(child);
                  const number = Number(text);
                  if (Number.isNaN(number)) {
                    column.type = 'rich-text';
                    row[column.id] = {
                      columnId: column.id,
                      value: AdapterTextUtils.createText(text),
                    };
                  } else {
                    row[column.id] = {
                      columnId: column.id,
                      value: number,
                    };
                  }
                } else {
                  row[column.id] = {
                    columnId: column.id,
                    value: HastUtils.getTextContent(child),
                  };
                }
                if (
                  column.type === 'rich-text' &&
                  !AdapterTextUtils.isText(row[column.id].value)
                ) {
                  row[column.id] = {
                    columnId: column.id,
                    value: AdapterTextUtils.createText(row[column.id].value),
                  };
                }
              });
              walkerContext.setGlobalContextStack('hast:table:column', columns);
              walkerContext.pushGlobalContextStack('hast:table:rows', row);
            }
          }
        }
      },
      leave: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const { walkerContext } = context;
        switch (o.node.tagName) {
          case 'table': {
            const columns =
              walkerContext.getGlobalContextStack<BlocksuiteTableColumn>(
                'hast:table:column'
              );
            walkerContext.setGlobalContextStack('hast:table:column', []);
            const children = walkerContext.getGlobalContextStack<BlockSnapshot>(
              'hast:table:children'
            );
            walkerContext.setGlobalContextStack('hast:table:children', []);
            const cells = Object.create(null);
            walkerContext
              .getGlobalContextStack<BlocksuiteTableRow>('hast:table:rows')
              .forEach((row, i) => {
                Object.keys(row).forEach(columnId => {
                  const cell = row[columnId];
                  if (!cell) {
                    return;
                  }
                  if (
                    columns.find(column => column.id === columnId)?.type ===
                    'select'
                  ) {
                    cell.value = (cell.value as string[])[0];
                  }
                });
                cells[children.at(i)?.id ?? nanoid()] = row;
              });
            walkerContext.setGlobalContextStack('hast:table:cells', []);
            let databaseTitle = '';
            if (
              o.parent?.node.type === 'element' &&
              HastUtils.querySelector(o.parent.node, NotionDatabaseToken)
            ) {
              databaseTitle = HastUtils.getTextContent(
                HastUtils.querySelector(o.parent.node, NotionDatabaseTitleToken)
              );
            }
            walkerContext.openNode(
              {
                type: 'block',
                id: nanoid(),
                flavour: DatabaseBlockSchema.model.flavour,
                props: {
                  views: [
                    {
                      id: nanoid(),
                      name: 'Table View',
                      mode: 'table',
                      columns: [],
                      filter: {
                        type: 'group',
                        op: 'and',
                        conditions: [],
                      },
                      header: {
                        titleColumn:
                          columns.find(column => column.type === 'title')?.id ??
                          '',
                        iconColumn: 'type',
                      },
                    },
                  ],
                  title: {
                    '$blocksuite:internal:text$': true,
                    delta: databaseTitle
                      ? [
                          {
                            insert: databaseTitle,
                          },
                        ]
                      : [],
                  },
                  columns,
                  cells,
                },
                children: [],
              },
              'children'
            );
            children.forEach(child => {
              walkerContext.openNode(child, 'children').closeNode();
            });
            walkerContext.closeNode();
            walkerContext.cleanGlobalContextStack('hast:table:column');
            walkerContext.cleanGlobalContextStack('hast:table:rows');
            walkerContext.cleanGlobalContextStack('hast:table:children');
            break;
          }
          case 'th': {
            walkerContext.setGlobalContext('hast:disableimg', false);
            break;
          }
        }
      },
    },
    fromBlockSnapshot: {},
  };

export const DatabaseBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(databaseBlockNotionHtmlAdapterMatcher);
