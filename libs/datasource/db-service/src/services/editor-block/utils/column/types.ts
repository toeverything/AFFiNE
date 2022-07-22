/** Column */
import type { CSSProperties } from 'react';

export enum ColumnType {
    /**
     * the content of the text base block
     */
    content = 'content',
    number = 'number',
    enum = 'enum',
    date = 'date',
    boolean = 'boolean',
    file = 'file',
    string = 'string',
}
interface BaseColumn {
    id?: string;
    name: string;
    /**
     * key when assigning
     */
    key: string;
    /**
     * Properties used by the program, not as the display column of the Table
     * @deprecated
     */
    innerColumn?: boolean;
    /**
     * Whether to support adding to the tag below the block
     */
    supportAsTag?: boolean;
}
export interface ContentColumn extends BaseColumn {
    type: ColumnType.content;
}

export interface NumberColumn extends BaseColumn {
    type: ColumnType.number;
    /** not implemented */
    format: 'number' | 'percent';
}

export interface SelectOption {
    id: string;
    name: string;
    background?: string;
    value: string | boolean;
    color?: string;
}

export interface EnumColumn extends BaseColumn {
    type: ColumnType.enum;
    options: SelectOption[];
    /**
     * Limit the number of choices, if it is 1, it is a single choice
     */
    multiple: number;
}

export interface DateColumn extends BaseColumn {
    type: ColumnType.date;
    /**
     * Date format, such as: YYYY-MM-DD hh:mm:ss
     *ref: https://date-fns.org/v2.28.0/docs/format
     */
    format: string;
}

export interface BooleanColumn extends BaseColumn {
    type: ColumnType.boolean;
    options?: SelectOption[];
    sorter?: boolean;
}

export interface FileColumn extends BaseColumn {
    type: ColumnType.file;
    /**
     *ref: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file#accept
     */
    accept?: string;
    /**
     * Limit the number of choices, you can only choose one at a time, you can choose multiple times
     */
    multiple: number;
}

export interface StringColumn extends BaseColumn {
    type: ColumnType.string;
    mode: 'text' | 'url';
}

/**
 * @deprecated
 */
export type Column =
    | ContentColumn
    | NumberColumn
    | EnumColumn
    | DateColumn
    | BooleanColumn
    | FileColumn
    | StringColumn;

/**
 * ColumnValue
 * @deprecated
 */
export interface ContentColumnValue {
    value: Array<{ text: string; bold?: boolean }>;
}

/**
 * @deprecated
 */
export interface NumberColumnValue {
    value: number;
}

/**
 * @deprecated
 */
export interface EnumColumnValue<T = string> {
    value: T[];
}

/**
 * @deprecated
 */
type Timestamp = number;

/**
 * @deprecated
 */
export interface DateColumnValue {
    value: Timestamp;
}

/**
 * @deprecated
 */
export interface BooleanColumnValue {
    value: boolean;
}

/**
 * @deprecated
 */
type FileBlockId = string;

/**
 * @deprecated
 */
type UrlString = string;

/**
 * @deprecated
 */
export interface FileColumnValue {
    value: FileBlockId;
    url?: UrlString;
    name: string;
    /**
     * the size of the file in bytes
     */
    size: number;
    /**
     * ref file.type: https://developer.mozilla.org/en-US/docs/Web/API/File
     */
    type: string;
    height?: number;
    width?: number;
}

/**
 * @deprecated
 */
export interface StringColumnValue {
    value: string;
    name?: string;
}

export interface CommentColumnValue {
    pageId: string;
    attachedToBlocksIds?: string[];
    resolve: boolean;
    resolveUserId?: string;
    finishTime?: number;
}
export type FilterConstraint = Array<{
    key: string;
    checked: boolean;
    type: string;
    fieldValue: string;
    opSelectValue: string;
    valueSelectValue:
        | string
        | string[]
        | { title?: string; value?: string | boolean }[];
}>;

export type SorterConstraint = Array<{
    field: string;
    rule: string;
}>;
