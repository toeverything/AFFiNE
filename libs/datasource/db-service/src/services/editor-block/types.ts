import { Protocol } from '../../protocol';
import { Column, DefaultColumnsValue } from './utils/column';

export type BlockFlavors = typeof Protocol.Block.Type;
export type BlockFlavorKeys = keyof typeof Protocol.Block.Type;

export const containerFlavor: BlockFlavorKeys[] = [
    Protocol.Block.Type.workspace,
    Protocol.Block.Type.page,
    Protocol.Block.Type.group,
    Protocol.Block.Type.title,
    Protocol.Block.Type.grid,
    Protocol.Block.Type.gridItem,
];

export interface CreateEditorBlock {
    workspace: string;
    type: keyof BlockFlavors;
    parentId?: string;
}

export interface ReturnEditorBlock {
    id: string;
    workspace: string;
    type: BlockFlavorKeys;
    parentId?: string;
    pageId?: string;
    closestGroupId?: string;
    columns?: Column[];
    children: string[];
    properties?: Partial<DefaultColumnsValue>;
    created: number;
    lastUpdated: number;
    creator?: string;
}

export interface GetEditorBlock {
    ids: string[];
    workspace: string;
}

export interface UpdateEditorBlock
    extends Partial<
        Pick<ReturnEditorBlock, 'type' | 'parentId' | 'children' | 'properties'>
    > {
    id: string;
    workspace: string;
}

export interface DeleteEditorBlock {
    id: string;
    workspace: string;
}

export interface AddColumnProps {
    workspace: string;
    /**
     * block id
     * Support group, page block setting columns
     */
    blockId: string;
    column: Column;
}

export interface UpdateColumnProps {
    workspace: string;
    /**
     * block id
     * Support group, page block setting columns
     */
    blockId: string;
    columnId: string;
    column: Partial<Column>;
}

export interface RemoveColumnProps {
    workspace: string;
    /**
     * block id
     * Support group, page block setting columns
     */
    blockId: string;
    columnId: string;
}
