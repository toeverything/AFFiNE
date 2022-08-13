import {
    useMemo,
    memo,
    useRef,
    useState,
    useLayoutEffect,
    useCallback,
} from 'react';

import { VariableSizeGrid, areEqual } from 'react-window';
import type {
    GridChildComponentProps,
    GridItemKeySelector,
} from 'react-window';
import style9 from 'style9';
import './basic-table.scss';
export interface TableColumn {
    dataKey: string;
    label: string;
    width?: number;
    [key: string]: unknown;
}

export interface TableRow {
    height?: number;
    [key: string]: unknown;
}

export interface CustomCellProps<T = unknown> {
    columnIndex: number;
    rowIndex: number;
    column: TableColumn;
    row: TableRow;
    value: T;
    valueKey: string;
}
export type CustomCell<T = unknown> = (prop: CustomCellProps<T>) => JSX.Element;

interface TableData {
    columns: readonly TableColumn[];
    rows: readonly TableRow[];
    CustomCell: CustomCell;
}

export interface BasicTableProps {
    columns: readonly TableColumn[];
    rows: readonly TableRow[];
    headerHeight?: number;
    /**
     * row unique identifier
     */
    rowKey: string;
    /**
     * Whether to display border, default true
     */
    border?: boolean;
    renderCell?: CustomCell;
}

const DEFAULT_COLUMN_WIDTH = 150;
const DEFAULT_ROW_HEIGHT = 42;
const MAX_TABLE_HEIGHT = 400;
export const DEFAULT_RENDER_CELL: CustomCell = ({ value }) => {
    return <span>{value ? String(value) : '--'}</span>;
};

const Cell = memo(
    ({
        data,
        rowIndex,
        columnIndex,
        style,
    }: GridChildComponentProps<TableData>) => {
        const column = data.columns[columnIndex];
        const row = data.rows[rowIndex];
        const is_first_column = columnIndex === 0;
        const is_first_row = rowIndex === 0;

        const mergedStyle = {
            ...cellStyle,
            ...(!is_first_column ? cellLeftBorderStyle : {}),
            ...(!is_first_row ? cellTopBorderStyle : {}),
            ...style,
        };

        const CustomCell = data.CustomCell;
        return (
            <div style={mergedStyle}>
                <CustomCell
                    column={column}
                    row={row}
                    columnIndex={columnIndex}
                    rowIndex={rowIndex}
                    value={row[column.dataKey]}
                    valueKey={column.dataKey}
                />
            </div>
        );
    }
);

export const BasicTable = ({
    columns,
    rows,
    headerHeight = DEFAULT_ROW_HEIGHT,
    rowKey,
    border = true,
    renderCell = DEFAULT_RENDER_CELL,
}: BasicTableProps) => {
    const container_ref = useRef<HTMLDivElement>();
    const [table_width, set_table_width] = useState(0);

    useLayoutEffect(() => {
        const container_rect =
            container_ref.current?.getBoundingClientRect() || { width: 0 };
        const container_width = border
            ? container_rect.width - 2
            : container_rect.width;
        if (container_width !== table_width) {
            set_table_width(container_width);
        }
    });

    const rows_with_header = useMemo(() => {
        const header_row = columns.reduce((acc, cur) => {
            acc[cur.dataKey] = cur.label;
            return acc;
        }, {} as TableRow);
        header_row['height'] = headerHeight;
        return [header_row, ...rows];
    }, [rows, columns, headerHeight]);

    const table_height = useMemo(() => {
        let height = 0;
        let index = 0;
        while (height < MAX_TABLE_HEIGHT) {
            if (index >= rows_with_header.length) {
                return height;
            }
            const row = rows_with_header[index];
            height = height + (row.height || DEFAULT_ROW_HEIGHT);
            index = index + 1;
        }
        return MAX_TABLE_HEIGHT;
    }, [rows_with_header]);

    const item_data = useMemo<TableData>(
        () => ({ columns, rows: rows_with_header, CustomCell: renderCell }),
        [columns, rows_with_header]
    );

    const get_item_key = useCallback<GridItemKeySelector<TableData>>(
        ({ data, columnIndex, rowIndex }) => {
            const column = data.columns[columnIndex];
            const row = data.rows[rowIndex];
            return `${column.dataKey}_${row[rowKey]}`;
        },
        [rowKey]
    );

    return (
        <div ref={container_ref} style={containerBorderStyle}>
            {table_width ? (
                <VariableSizeGrid
                    className="v-basic-table-body"
                    columnCount={columns.length}
                    columnWidth={index =>
                        columns[index].width || DEFAULT_COLUMN_WIDTH
                    }
                    height={table_height}
                    rowCount={rows_with_header.length}
                    rowHeight={index =>
                        rows_with_header[index].height || DEFAULT_ROW_HEIGHT
                    }
                    width={table_width}
                    itemData={item_data}
                    itemKey={get_item_key}
                >
                    {Cell}
                </VariableSizeGrid>
            ) : null}
        </div>
    );
};

const containerBorderStyle: React.CSSProperties = {
    borderTop: '1px solid #ECEFF3',
    borderBottom: '1px solid #ECEFF3',
    boxSizing: 'border-box',
};

const cellStyle: React.CSSProperties = {
    overflowX: 'hidden',
    overflowY: 'hidden',
    padding: '10px 4px',
    boxSizing: 'border-box',
};

const cellLeftBorderStyle: React.CSSProperties = {
    // borderLeft: '1px solid #98ACBD'
};

const cellTopBorderStyle: React.CSSProperties = {
    borderTop: '1px solid #ECEFF3',
    borderBottom: '1px solid #ECEFF3',
    boxSizing: 'border-box',
};
