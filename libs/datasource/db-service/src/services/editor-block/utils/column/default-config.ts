import {
    Column,
    ColumnType,
    ContentColumnValue,
    BooleanColumnValue,
    StringColumnValue,
    FileColumnValue,
    DateColumnValue,
    EnumColumnValue,
    CommentColumnValue,
    FilterConstraint,
    SorterConstraint,
} from './types';

export enum GroupScene {
    page = 'page',
    table = 'table',
    kanban = 'kanban',
    whiteboard = 'whiteboard',
}

/**
 * @deprecated
 */
export enum BlockStatus {
    notStart = 'notStart',
    progress = 'progress',
    done = 'done',
}

/**
 * @deprecated
 */
export type DefaultColumnsValue = {
    scene: string;
    visibleColumnKeys: EnumColumnValue;
    shapeProps: StringColumnValue;
    text: ContentColumnValue;
    textStyle: Record<'textAlign', string>;
    checked: BooleanColumnValue;
    collapsed: BooleanColumnValue;
    embedLink: StringColumnValue;
    image: FileColumnValue;
    file: FileColumnValue;
    endDate: DateColumnValue;
    status: EnumColumnValue<BlockStatus>;
    gridItemWidth: string;
    reference: string;
    numberType: any;
    image_style: any;
    lang: any;
    fullWidthChecked: boolean;
    comment: CommentColumnValue;
    filterConstraint: FilterConstraint;
    filterWeakSqlConstraint: string;
    sorterConstraint: SorterConstraint;
};

export const DEFAULT_COLUMN_KEYS = {
    Text: 'text',
    Checked: 'checked',
} as const;

/**
 * @deprecated
 */
export const DEFAULT_COLUMNS: Column[] = [
    /** System internal variables */ {
        // Display mode of group / page
        name: 'Scene',
        type: ColumnType.enum,
        key: 'scene',
        multiple: 1,
        options: [
            { id: 'todo', name: 'Todo List', value: GroupScene.page },
            { id: 'page', name: 'Table', value: GroupScene.table },
        ],
        innerColumn: true,
    },
    {
        // block selected displayed columns
        name: 'visibleColumnKeys',
        type: ColumnType.enum,
        key: 'scene',
        multiple: 1,
        /**
         * All columns that the user can see, empty means unlimited options
         */
        options: [],
        innerColumn: true,
    },
    {
        name: 'collapsed',
        type: ColumnType.boolean,
        key: 'collapsed',
        innerColumn: true,
    },
    {
        name: 'shapeProps',
        type: ColumnType.string,
        key: 'shapeProps',
        mode: 'text',
        innerColumn: true,
    },
    {
        // text content
        name: 'Content',
        type: ColumnType.content,
        key: DEFAULT_COLUMN_KEYS.Text,
    },
    {
        name: 'Status',
        type: ColumnType.enum,
        key: 'status',
        options: [
            {
                id: 'notStart',
                name: 'Not Start',
                value: BlockStatus.notStart,
                color: '#E53535',
                background: '#FFCECE',
            },
            {
                id: 'progress',
                name: 'Progress',
                value: BlockStatus.progress,
                color: '#A77F1A',
                background: '#FFF5AB',
            },
            {
                id: 'done',
                name: 'Done',
                value: BlockStatus.done,
                color: '#3C8867',
                background: '#C5FBE0',
            },
        ],
        multiple: 1,
        innerColumn: true,
    },
    {
        name: 'Checked',
        type: ColumnType.boolean,
        key: DEFAULT_COLUMN_KEYS.Checked,
        options: [
            { id: 'checked', name: 'checked', value: true },
            { id: 'unChecked', name: 'unChecked', value: false },
        ],
        sorter: true,
    },
    {
        name: 'Embed Link',
        type: ColumnType.string,
        key: 'embedLink',
        mode: 'url',
        supportAsTag: true,
        innerColumn: true,
    },
    {
        name: 'Image',
        type: ColumnType.file,
        key: 'image',
        accept: 'image/gif,image/jpeg,image/jpg,image/png,image/svg',
        multiple: 1,
        supportAsTag: true,
        innerColumn: true,
    },
    {
        name: 'File',
        type: ColumnType.file,
        key: 'file',
        multiple: 1,
        supportAsTag: true,
        innerColumn: true,
    },
    {
        name: 'Start Date',
        type: ColumnType.date,
        key: 'startDate',
        format: 'YYYY-MM-dd HH:mm:ss',
        supportAsTag: true,
        innerColumn: true,
    },
    {
        name: 'End Date',
        type: ColumnType.date,
        key: 'endDate',
        format: 'YYYY-MM-dd HH:mm:ss',
        supportAsTag: true,
        innerColumn: true,
    },
];
