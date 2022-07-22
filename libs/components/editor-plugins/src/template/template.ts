import { Virgo, AsyncBlock } from '@toeverything/framework/virgo';
import {
    Protocol,
    services,
    Template,
} from '@toeverything/datasource/db-service';
import assert from 'assert';
import format from 'date-fns/format';

import { BasePlugin } from '../base-plugin';
export class TemplatePlugin extends BasePlugin {
    static singleton: TemplatePlugin;

    public static override get pluginName(): string {
        return 'tempalte';
    }

    async exportTemplate(blockId: string): Promise<Template> {
        const editor: Virgo = this.editor;
        const curBlock = await editor.getBlockById(
            blockId || editor.getRootBlockId()
        );

        const exportData: Template = {
            type: curBlock.type,
            properties: curBlock.getProperties(),
            blocks: [],
        };
        const blocks = await curBlock.children();
        for (let i = 0; i < blocks.length; i++) {
            const subTemplate = await this.exportTemplate(blocks[i].id);
            const exportBlock: Template = {
                type: blocks[i].type,
                properties: blocks[i].getProperties(),
                blocks: subTemplate.blocks,
            };
            exportData.blocks.push(exportBlock);
        }

        return exportData;
    }
    private _generateDailyNote_title() {
        return `${format(new Date(), 'yyyy/MM/dd')}`;
    }
    public async addDailyNote(): Promise<AsyncBlock> {
        return this._addDailyNote();
    }
    private async _addDailyNote() {
        const newPageBlock = await this.editor.createBlock('page');
        newPageBlock.setProperties({
            text: { value: [{ text: this._generateDailyNote_title() }] },
        });
        const nextBlock = await this.editor.createBlock(
            Protocol.Block.Type.todo
        );
        nextBlock.setProperties({
            text: { value: [{ text: '1. Get Things Done' }] },
        });
        newPageBlock.append(nextBlock);
        this._addPageIntoWorkspace(newPageBlock);
        return newPageBlock;
    }
    private _getDefaultWorkspaceId() {
        return window.location.pathname.split('/')[1];
    }
    private async _addPageIntoWorkspace(
        newPageBlock: AsyncBlock,
        targetWorkspaceId?: string
    ) {
        const workspaceId = targetWorkspaceId || this._getDefaultWorkspaceId();
        const pageId = newPageBlock.id;
        const items = await services.api.pageTree.getPageTree<any>(workspaceId);
        await services.api.pageTree.setPageTree<any>(workspaceId, [
            { id: pageId, children: [] },
            ...items,
        ]);
    }
    async imporPageData(importData: Template, targetWorkspaceId: string) {
        assert(importData, 'importData is required');

        //create new page
        const newPageBlock = await this.editor.createBlock('page');

        newPageBlock.setProperties(importData.properties);

        for (let i = 0; i < importData.blocks.length; i++) {
            const nextBlock = await this.editor.createBlock(
                importData.blocks[i].type
            );
            nextBlock.setProperties(importData.blocks[i].properties);
            newPageBlock.append(nextBlock);
        }

        // update page tree
        this._addPageIntoWorkspace(newPageBlock);

        return newPageBlock.id;
    }
    async exportTemplateJson(block_id: string) {
        return this.exportTemplate(block_id);
    }
    async imporPageDataJson(json_str: string, targetWorkspaceId: string) {
        assert(json_str, 'json_str is required');
        const importData: Template = JSON.parse(json_str);
        return this.imporPageData(importData, targetWorkspaceId);
    }
}
