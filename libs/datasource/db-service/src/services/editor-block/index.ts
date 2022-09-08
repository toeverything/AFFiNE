import { BlockImplInstance, MapOperation } from '@toeverything/datasource/jwt';
import { has } from '@toeverything/utils';
import { diffArrays } from 'diff';
import { ServiceBaseClass } from '../base';
import type { ReturnUnobserve } from '../database/observer';
import { Template, TemplateProperties } from './templates/types';
import {
    AddColumnProps,
    BlockFlavorKeys,
    CreateEditorBlock,
    DeleteEditorBlock,
    GetEditorBlock,
    RemoveColumnProps,
    ReturnEditorBlock,
    UpdateColumnProps,
    UpdateEditorBlock,
} from './types';
import {
    addColumn,
    Column,
    dbBlock2BusinessBlock,
    deserializeColumnConfig,
    getOrInitBlockContentColumnsField,
    serializeColumnConfig,
} from './utils';
export type ObserveCallback = (businessBlock: ReturnEditorBlock) => void;
export class EditorBlock extends ServiceBaseClass {
    async create({
        workspace,
        type,
        parentId,
    }: CreateEditorBlock): Promise<ReturnEditorBlock> {
        const db = await this.database.getDatabase(workspace);
        const dbBlock = await db.get(type as 'block');
        if (parentId) {
            const parentBlock = await db.get(parentId as 'block');
            if (parentBlock.id === parentId) {
                parentBlock.insertChildren(dbBlock);
            }
        }
        // Initialize the columns field of the block
        getOrInitBlockContentColumnsField(dbBlock);
        return dbBlock2BusinessBlock({
            workspace,
            dbBlock,
        }) as ReturnEditorBlock;
    }

    async get({
        workspace,
        ids,
    }: GetEditorBlock): Promise<Array<ReturnEditorBlock | null>> {
        const blocks = await Promise.all(
            ids.map(async id => {
                const block = await this.getBlock(workspace, id);
                return dbBlock2BusinessBlock({
                    workspace,
                    dbBlock: block,
                });
            })
        );
        return blocks;
    }

    async getBlockByFlavor(
        workspace: string,
        flavor: BlockFlavorKeys
    ): Promise<string[]> {
        const db = await this.database.getDatabase(workspace);
        const keys: string[] = await db.getBlockByFlavor(flavor);
        return keys;
    }

    async getUserId(workspace: string): Promise<string> {
        const db = await this.database.getDatabase(workspace);
        return db.getUserId();
    }

    async update(businessBlock: UpdateEditorBlock): Promise<boolean> {
        const db = await this.database.getDatabase(businessBlock.workspace);
        if (!businessBlock.id) {
            return false;
        }
        const db_block = await this.getBlock(
            businessBlock.workspace,
            businessBlock.id as 'block'
        );
        if (!db_block) {
            return false;
        }
        if (
            has(businessBlock, 'type') &&
            businessBlock.type !== db_block.flavor
        ) {
            db_block.setFlavor(businessBlock.type as 'text');
        }
        if (
            has(businessBlock, 'parentId') &&
            businessBlock.parentId !== db_block.parent?.id
        ) {
            db_block.remove();
            const parent = await db.get(businessBlock.id as 'block');
            if (!parent) {
                return false;
            }
            parent.append(db_block);
        }
        if (
            has(businessBlock, 'children') &&
            businessBlock.children !== db_block.children
        ) {
            const patches = diffArrays(
                db_block.children || [],
                businessBlock.children || []
            );
            let position = 0;
            for (let i = 0; i < patches.length; i++) {
                const patch = patches[i];
                if (patch.added) {
                    if (patch.value.length) {
                        for (let i = 0; i < patch.value.length; i++) {
                            const child = await db.get(
                                patch.value[i] as 'block'
                            );
                            if (child && child.id === patch.value[i]) {
                                db_block.insertChildren(child, {
                                    pos: position,
                                });
                                position = position + 1;
                            }
                        }
                    }
                } else if (patch.removed) {
                    patch.value.forEach(child_id => {
                        db_block.removeChildren(child_id);
                    });
                } else if (patch.count) {
                    position = position + patch.count;
                }
            }
        }

        const decorations = db_block.getDecorations();
        Object.entries(businessBlock.properties || {}).forEach(
            ([key, value]) => {
                if (value === undefined) {
                    db_block.removeDecoration(key);
                    return;
                }
                if (decorations[key] !== value) {
                    db_block.setDecoration(key, value);
                    return;
                }
            }
        );
        return true;
    }

    async delete({ workspace, id }: DeleteEditorBlock): Promise<boolean> {
        const db = await this.database.getDatabase(workspace);
        const db_block = await db.get(id as 'block');
        if (!db_block) {
            return false;
        }
        db_block.remove();
        return true;
    }
    async suspend(workspace: string, flag: boolean): Promise<void> {
        const db = await this.database.getDatabase(workspace);
        db.suspend(flag);
    }

    async addColumn({
        workspace,
        blockId,
        column,
    }: AddColumnProps): Promise<boolean> {
        const db_block = await this.getBlock(workspace, blockId);
        if (!db_block) {
            return false;
        }
        const columns = getOrInitBlockContentColumnsField(db_block);
        if (!columns) {
            return false;
        }
        addColumn({
            block: db_block,
            columns,
            columnConfig: column,
        });
        return true;
    }

    async updateColumn({
        workspace,
        blockId,
        columnId,
        column,
    }: UpdateColumnProps): Promise<boolean> {
        const db_block = await this.getBlock(workspace, blockId);
        if (!db_block) {
            return false;
        }
        const columns = getOrInitBlockContentColumnsField(db_block);
        if (!columns) {
            return false;
        }
        const old_column = columns.find<MapOperation<string>>(col => {
            // @ts-ignore TODO: don't know why
            return col.get('id') === columnId;
        });
        if (!old_column) {
            return false;
        }
        const column_config = {
            // @ts-ignore TODO: don't know why
            ...deserializeColumnConfig(old_column?.get('config') as string),
            ...column,
        };
        old_column?.set(
            'config',
            // @ts-ignore TODO: don't know why
            serializeColumnConfig(column_config as Column)
        );
        return true;
    }

    async removeColumn({
        workspace,
        blockId,
        columnId,
    }: RemoveColumnProps): Promise<boolean> {
        const db_block = await this.getBlock(workspace, blockId);
        if (!db_block) {
            return false;
        }
        const columns = getOrInitBlockContentColumnsField(db_block);
        if (columns?.length) {
            // @ts-ignore TODO: don't know why
            const idx = columns?.findIndex(col => col.get('id') === columnId);
            if (idx > -1) {
                columns.delete(idx, 1);
            }
        }
        return true;
    }
    private async decorate_page_title(
        page_block: BlockImplInstance,
        prefix: string
    ) {
        const text = page_block.getDecoration('text');
        if (page_block && text) {
            const new_text = JSON.parse(JSON.stringify(text));
            //@ts-ignore
            new_text.value[0].text = prefix + new_text.value[0].text;
            page_block.setDecoration('text', new_text);
        }
    }
    private async update_page_title(
        pageBlock: BlockImplInstance,
        title: string
    ) {
        if (title) {
            pageBlock.setDecoration('text', { value: [{ text: title }] });
        }
    }
    async copyPage(
        workspaceId: string,
        source_page_id: string,
        new_page_id: string
    ): Promise<boolean> {
        const db = await this.database.getDatabase(workspaceId);

        const source_page = await this.getBlock(
            workspaceId,
            source_page_id as 'block'
        );
        const new_page = await this.getBlock(
            workspaceId,
            new_page_id as 'block'
        );
        if (!source_page) {
            return false;
        }
        const source_page_children = source_page.children;
        const decorations = source_page.getDecorations();
        Object.entries(decorations).forEach(([key, value]) => {
            new_page?.setDecoration(key, source_page.getDecoration(key));
        });

        //@ts-ignore
        this.decorate_page_title(new_page, 'copy from ');

        for (let i = 0; i < source_page_children.length; i++) {
            const source_page_child = await db.get(
                source_page_children[i] as 'block'
            );
            new_page?.insertChildren(source_page_child);
        }
        return true;
    }
    async copyTemplateToPage(
        workspace: string,
        sourcePageId: string,
        templateData: Template
    ) {
        const db = await this.database.getDatabase(workspace);
        const sourcePage = await this.getBlock(
            workspace,
            sourcePageId as 'block'
        );

        if (!sourcePage) {
            return false;
        }
        if (templateData.properties && templateData.properties.text) {
            this.update_page_title(
                sourcePage,
                templateData.properties.text?.value[0].text
            );
        }

        this.update_block_properies(sourcePage, templateData.properties);
        if (!templateData.blocks) return false;
        for (let i = 0; i < templateData.blocks.length; i++) {
            const blockData = templateData.blocks[i];
            const sourcPageChild = await db.get(blockData.type as 'block');

            this.update_block_properies(sourcPageChild, blockData.properties);

            sourcePage?.insertChildren(sourcPageChild);

            await this.copyTemplateToBlocks(
                workspace,
                sourcPageChild.id,
                blockData
            );
        }
        return true;
    }
    private update_block_properies(
        block: BlockImplInstance,
        properties: TemplateProperties
    ) {
        Object.entries(properties).forEach(([key, value]) => {
            block.setDecoration(key, value);
        });
    }
    async copyTemplateToBlocks(
        workspace: string,
        parentBlockId: string,
        template: Template
    ) {
        const db = await this.database.getDatabase(workspace);
        const parentBlock = await this.getBlock(
            workspace,
            parentBlockId as 'block'
        );

        if (!parentBlock) {
            return false;
        }
        if (!template.blocks) return true;
        for (let i = 0; i < template.blocks.length; i++) {
            const blockData = template.blocks[i];
            const sourcPageChild = await db.get(blockData.type as 'block');

            this.update_block_properies(sourcPageChild, blockData.properties);

            parentBlock?.insertChildren(sourcPageChild);
            if (blockData.blocks) {
                this.copyTemplateToBlocks(
                    workspace,
                    sourcPageChild.id,
                    blockData
                );
            }
        }
        return true;
    }
    async observe(
        { workspace, id }: DeleteEditorBlock,
        callback: ObserveCallback
    ): Promise<ReturnUnobserve> {
        return await this._observe(workspace, id, async (states, block) => {
            callback(
                dbBlock2BusinessBlock({
                    workspace,
                    dbBlock: block,
                }) as ReturnEditorBlock
            );
        });
    }

    async unobserve({ workspace, id }: DeleteEditorBlock) {
        await this._unobserve(workspace, id);
    }
}

export type {
    BlockFlavorKeys,
    BlockFlavors,
    CreateEditorBlock,
    DeleteEditorBlock,
    GetEditorBlock,
    ReturnEditorBlock,
    UpdateEditorBlock,
} from './types';
export {
    ColumnType,
    isBooleanColumn,
    isContentColumn,
    isDateColumn,
    isEnumColumn,
    isFileColumn,
    isNumberColumn,
    isStringColumn,
} from './utils/column';
export type {
    BooleanColumn,
    BooleanColumnValue,
    Column,
    ContentColumn,
    ContentColumnValue,
    DateColumn,
    DateColumnValue,
    DefaultColumnsValue,
    EnumColumn,
    EnumColumnValue,
    FileColumn,
    FileColumnValue,
    NumberColumn,
    NumberColumnValue,
    StringColumnValue,
} from './utils/column';
