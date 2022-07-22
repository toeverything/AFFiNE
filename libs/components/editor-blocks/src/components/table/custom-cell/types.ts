import type { Column } from '@toeverything/datasource/db-service';
import type { CustomCellProps, TableColumn } from '../basic-table';

/**
 * @deprecated
 */
export interface BusinessTableColumn extends TableColumn {
    columnConfig: Column;
}

/**
 * @deprecated
 */
export interface CellProps<T = unknown> extends CustomCellProps<T> {
    onChange: (value: T) => void;
    column: BusinessTableColumn;
}
