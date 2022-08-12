import {
    ArrayOperation,
    BlockImplInstance,
    MapOperation,
} from '@toeverything/datasource/jwt';
import { nanoid } from 'nanoid';
import { DEFAULT_COLUMNS } from './default-config';
import type { Column } from './types';
export const serializeColumnConfig = (column: Column): string => {
    // TODO: Do the type check of the column parameter here
    return JSON.stringify(column);
};

export const deserializeColumnConfig = (config: string): Column => {
    // TODO: do the column check here
    return JSON.parse(config) as Column;
};

/**
 * Support for adding column blocks
 */
const SUPPORT_COLUMN_FLAVORS = ['group', 'page'];

interface AddColumnProps {
    block: BlockImplInstance;
    columns: ArrayOperation<MapOperation<string>>;
    columnConfig: Column;
}

export const addColumn = ({ block, columns, columnConfig }: AddColumnProps) => {
    const content = block.getContent();

    const column_id = nanoid(16);
    const config = serializeColumnConfig({
        ...columnConfig,
        id: column_id,
    });

    const db_column = content.createMap<string>();
    // @ts-ignore TODO: don't know why
    db_column.set('id', column_id);
    // @ts-ignore TODO: don't know why
    db_column.set('config', config);
    columns?.insert(columns.length, [db_column]);
};

/**
 * @deprecated
 */
export const getOrInitBlockContentColumnsField = (
    block: BlockImplInstance
): ArrayOperation<MapOperation<string>> | undefined => {
    if (!SUPPORT_COLUMN_FLAVORS.includes(block.flavor)) {
        return undefined;
    }
    const content = block.getContent();
    if (!content.has('columns')) {
        const columns = content.createArray();
        content.set('columns', columns);
        DEFAULT_COLUMNS.forEach(col => {
            addColumn({
                block,
                columns: columns.asArray() as ArrayOperation<
                    MapOperation<string>
                >,
                columnConfig: col,
            });
        });
    }
    return content.get('columns')?.asArray();
};

export const getBlockColumns = (
    block: BlockImplInstance
): Column[] | undefined => {
    const columns = getOrInitBlockContentColumnsField(block)?.map<Column>(
        column => {
            const config_string = column.get('config') as unknown as string;
            return {
                id: column.get('id'),
                ...(config_string
                    ? deserializeColumnConfig(config_string)
                    : {}),
            } as Column;
        }
    );
    return columns;
};

export type { DefaultColumnsValue } from './default-config';
export { ColumnType } from './types';
export type {
    BooleanColumn,
    BooleanColumnValue,
    Column,
    ContentColumn,
    ContentColumnValue,
    DateColumn,
    DateColumnValue,
    EnumColumn,
    EnumColumnValue,
    FileColumn,
    FileColumnValue,
    NumberColumn,
    NumberColumnValue,
    StringColumnValue,
} from './types';
export {
    isBooleanColumn,
    isContentColumn,
    isDateColumn,
    isEnumColumn,
    isFileColumn,
    isNumberColumn,
    isStringColumn,
} from './utils';
