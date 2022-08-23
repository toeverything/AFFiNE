import type { RegisterDependencyConfig } from '@toeverything/utils';
import { DiContainer } from '@toeverything/utils';
import { CommentService } from './comment';
import { Database } from './database';
import { EditorBlock } from './editor-block';
import { FileService } from './file';
import { PageTree } from './workspace/page-tree';
import { UserConfig } from './workspace/user-config';

export {
    ColumnType,
    isBooleanColumn,
    isContentColumn,
    isDateColumn,
    isEnumColumn,
    isFileColumn,
    isNumberColumn,
    isStringColumn,
} from './editor-block';
export type {
    BlockFlavorKeys,
    BlockFlavors,
    BooleanColumn,
    BooleanColumnValue,
    Column,
    ContentColumn,
    ContentColumnValue,
    CreateEditorBlock,
    DateColumn,
    DateColumnValue,
    DefaultColumnsValue,
    DeleteEditorBlock,
    EnumColumn,
    EnumColumnValue,
    FileColumn,
    FileColumnValue,
    GetEditorBlock,
    NumberColumn,
    NumberColumnValue,
    ReturnEditorBlock,
    StringColumnValue,
    UpdateEditorBlock,
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
