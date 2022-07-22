import type { BlockImplInstance } from '@toeverything/datasource/jwt';
import { ReturnEditorBlock } from '../types';
import { getClosestGroup } from './common';
import { getBlockColumns } from './column';

interface DbBlock2BusinessBlockProps {
    workspace: string;
    dbBlock?: BlockImplInstance | null;
}

export const dbBlock2BusinessBlock = ({
    workspace,
    dbBlock,
}: DbBlock2BusinessBlockProps): ReturnEditorBlock | null => {
    if (!dbBlock) {
        return null;
    }
    const block = {} as ReturnEditorBlock;
    block.id = dbBlock.id;
    block.type = dbBlock.flavor;
    block.workspace = workspace;
    block.parentId = dbBlock.parent?.id;
    block.closestGroupId = getClosestGroup(dbBlock)?.id;
    block.children = dbBlock.children || [];
    block.properties = dbBlock.getDecorations();
    block.created = dbBlock.created;
    block.lastUpdated = dbBlock.lastUpdated;
    block.columns = getBlockColumns(dbBlock);
    block.creator = dbBlock.creator;
    return block;
};

export {
    getOrInitBlockContentColumnsField,
    serializeColumnConfig,
    deserializeColumnConfig,
    addColumn,
    ColumnType,
    isBooleanColumn,
    isContentColumn,
    isDateColumn,
    isFileColumn,
    isNumberColumn,
    isEnumColumn,
    isStringColumn,
} from './column';
export type {
    Column,
    DefaultColumnsValue,
    ContentColumnValue,
    NumberColumnValue,
    EnumColumnValue,
    BooleanColumnValue,
    DateColumnValue,
    FileColumnValue,
    StringColumnValue,
} from './column';
