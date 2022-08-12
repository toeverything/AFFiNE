import type {
    BooleanColumn,
    Column,
    ContentColumn,
    DateColumn,
    EnumColumn,
    FileColumn,
    NumberColumn,
    StringColumn,
} from './types';

export const isContentColumn = (column: Column): column is ContentColumn => {
    return column.type === 'content';
};

export const isStringColumn = (column: Column): column is StringColumn => {
    return column.type === 'string';
};

export const isNumberColumn = (column: Column): column is NumberColumn => {
    return column.type === 'number';
};

export const isEnumColumn = (column: Column): column is EnumColumn => {
    return column.type === 'enum';
};

export const isDateColumn = (column: Column): column is DateColumn => {
    return column.type === 'date';
};

export const isFileColumn = (column: Column): column is FileColumn => {
    return column.type === 'file';
};

export const isBooleanColumn = (column: Column): column is BooleanColumn => {
    return column.type === 'boolean';
};
