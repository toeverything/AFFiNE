import type { DatabaseBlockDataSource } from '@blocksuite/affine/blocks';
import type { Doc, DocCustomPropertyInfo } from '@toeverything/infra';

// make database property type to be compatible with DocCustomPropertyInfo
export type DatabaseProperty = Required<
  Pick<DocCustomPropertyInfo, 'id' | 'name' | 'type' | 'additionalData'>
>;

export interface DatabaseValueCell {
  property: DatabaseProperty;
  value: unknown;
}

export interface DatabaseRow {
  cells: DatabaseValueCell[];
  id: string; // row id (block id)
  doc: Doc; // the doc that contains the database. required for editing etc.
  docId: string; // for rendering the doc reference
  dataSource: DatabaseBlockDataSource;
  databaseId: string;
  databaseName: string; // the title
}

export interface DatabaseCellRendererProps {
  rowId: string;
  cell: DatabaseValueCell;
  dataSource: DatabaseBlockDataSource;
}
