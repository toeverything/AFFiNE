import type { BlockImplInstance } from '@toeverything/datasource/jwt';
import { ReturnEditorBlock } from '../types';
import { getBlockColumns } from './column';
import { getClosestGroup } from './common';

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
    addColumn,
    ColumnType,
    deserializeColumnConfig,
    getOrInitBlockContentColumnsField,
    isBooleanColumn,
    isContentColumn,
    isDateColumn,
    isEnumColumn,
    isFileColumn,
    isNumberColumn,
    isStringColumn,
    serializeColumnConfig,
} from './column';
export type {
    BooleanColumnValue,
    Column,
    ContentColumnValue,
    DateColumnValue,
    DefaultColumnsValue,
    EnumColumnValue,
    FileColumnValue,
    NumberColumnValue,
    StringColumnValue,
} from './column';
