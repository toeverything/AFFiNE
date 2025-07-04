import type { DeltaInsert, Text } from '@blocksuite/store';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

import type { BlockMeta } from '../../utils/types';

export type TableCell = {
  text: Text;
};

export interface TableRow {
  rowId: string;
  order: string;
  backgroundColor?: string;
}

export interface TableColumn {
  columnId: string;
  order: string;
  backgroundColor?: string;
  width?: number;
}

export interface TableBlockProps extends BlockMeta {
  rows: Record<string, TableRow>;
  columns: Record<string, TableColumn>;
  // key = `${rowId}:${columnId}`
  cells: Record<string, TableCell>;
  comments?: Record<string, boolean>;
}

export interface TableCellSerialized {
  text: {
    delta: DeltaInsert[];
  };
}

export interface TableBlockPropsSerialized {
  rows: Record<string, TableRow>;
  columns: Record<string, TableColumn>;
  cells: Record<string, TableCellSerialized>;
}

export class TableBlockModel extends BlockModel<TableBlockProps> {}
export const TableModelFlavour = 'affine:table';
export const TableBlockSchema = defineBlockSchema({
  flavour: TableModelFlavour,
  props: (): TableBlockProps => ({
    rows: {},
    columns: {},
    cells: {},
    comments: undefined,
    'meta:createdAt': undefined,
    'meta:createdBy': undefined,
    'meta:updatedAt': undefined,
    'meta:updatedBy': undefined,
  }),
  metadata: {
    isFlatData: true,
    role: 'content',
    version: 1,
    parent: ['affine:note'],
    children: [],
  },
  toModel: () => new TableBlockModel(),
});

export const TableBlockSchemaExtension = BlockSchemaExtension(TableBlockSchema);
