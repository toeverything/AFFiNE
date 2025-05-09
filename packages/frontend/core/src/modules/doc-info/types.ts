import type { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { LiveData } from '@toeverything/infra';

import type { Doc } from '../doc';

// make database property type to be compatible with DocCustomPropertyInfo
export type DatabaseProperty<Data = Record<string, unknown>> = {
  id: string;
  name$: LiveData<string | undefined>;
  type$: LiveData<string | undefined>;
  data$: LiveData<Data | undefined>;
};

export interface DatabaseValueCell<
  T = unknown,
  Data = Record<string, unknown>,
> {
  value$: LiveData<T>;
  property: DatabaseProperty<Data>;
  id: string;
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
  onChange: (value: unknown) => void;
}
