import type { FC } from 'react';
import { ColumnType } from '@toeverything/datasource/db-service';
import type { CustomCellProps as TableCustomCellProps } from '../basic-table';
import { DEFAULT_RENDER_CELL } from '../basic-table';
import { CheckBoxCell } from './check-box';
import { SelectCell } from './select';
import type { CellProps } from './types';

/**
 * @deprecated
 */
const DefaultCell: FC<CellProps> = ({ onChange, ...props }) => {
    return <DEFAULT_RENDER_CELL {...props} />;
};

/**
 * @deprecated
 */
const cellMap: Record<ColumnType, FC<CellProps<any>>> = {
    [ColumnType.content]: DefaultCell,
    [ColumnType.number]: DefaultCell,
    [ColumnType.enum]: SelectCell,
    [ColumnType.date]: DefaultCell,
    [ColumnType.boolean]: CheckBoxCell,
    [ColumnType.file]: DefaultCell,
    [ColumnType.string]: DefaultCell,
};

/**
 * @deprecated
 */
interface CustomCellProps extends TableCustomCellProps<unknown> {
    onChange: (data: TableCustomCellProps<unknown>) => void;
}

export const CustomCell: FC<CustomCellProps> = props => {
    const View =
        props.rowIndex === 0
            ? DefaultCell
            : cellMap[props.column['type'] as ColumnType] || DefaultCell;
    return (
        <View
            {...(props as CellProps)}
            onChange={value => {
                props.onChange({
                    ...props,
                    value,
                });
            }}
        />
    );
};
