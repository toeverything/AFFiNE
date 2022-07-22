import { DiContainer } from '@toeverything/utils';
import type { RegisterDependencyConfig } from '@toeverything/utils';
import { Database } from './database';
import { PageTree } from './workspace/page-tree';
import { UserConfig } from './workspace/user-config';
import { EditorBlock } from './editor-block';
import { FileService } from './file';
import { CommentService } from './comment';

export type {
    CreateEditorBlock,
    ReturnEditorBlock,
    GetEditorBlock,
    DeleteEditorBlock,
    UpdateEditorBlock,
    BlockFlavors,
    BlockFlavorKeys,
    Column,
    ContentColumn,
    NumberColumn,
    EnumColumn,
    DateColumn,
    BooleanColumn,
    FileColumn,
    DefaultColumnsValue,
    ContentColumnValue,
    NumberColumnValue,
    EnumColumnValue,
    BooleanColumnValue,
    DateColumnValue,
    FileColumnValue,
    StringColumnValue,
} from './editor-block';
export {
    ColumnType,
    isBooleanColumn,
    isContentColumn,
    isDateColumn,
    isFileColumn,
    isNumberColumn,
    isEnumColumn,
    isStringColumn,
} from './editor-block';

export interface DbServicesMap {
    editorBlock: EditorBlock;
    pageTree: PageTree;
    userConfig: UserConfig;
    file: FileService;
    commentService: CommentService;
}

interface RegisterDependencyConfigWithName extends RegisterDependencyConfig {
    callName: string;
}

const dbServiceConfig: RegisterDependencyConfigWithName[] = [
    {
        type: 'value',
        callName: 'database',
        token: Database,
        value: new Database({}),
        dependencies: [],
    },
    {
        type: 'class',
        callName: 'editorBlock',
        token: EditorBlock,
        value: EditorBlock,
        dependencies: [{ token: Database }],
    },
    {
        type: 'class',
        callName: 'pageTree',
        token: PageTree,
        value: PageTree,
        dependencies: [{ token: Database }],
    },
    {
        type: 'class',
        callName: 'userConfig',
        token: UserConfig,
        value: UserConfig,
        dependencies: [{ token: Database }, { token: PageTree, lazy: true }],
    },
    {
        type: 'class',
        callName: 'file',
        token: FileService,
        value: FileService,
        dependencies: [{ token: Database }],
    },
    {
        type: 'class',
        callName: 'commentService',
        token: CommentService,
        value: CommentService,
        dependencies: [{ token: EditorBlock }],
    },
];

export const serviceMapByCallName = dbServiceConfig.reduce((acc, cur) => {
    acc[cur.callName] = cur;
    return acc;
}, {} as Record<string, RegisterDependencyConfigWithName>);

export const diContainer = new DiContainer();
diContainer.register(dbServiceConfig);
