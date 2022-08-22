import { Editor } from '../editor';
import { SelectBlock, SelectInfo } from '@toeverything/components/editor-core';
import { ClipBlockInfo, OFFICE_CLIPBOARD_MIMETYPE } from './types';
import { Clip } from './clip';

export class ClipboardUtils {
    private _editor: Editor;
    constructor(editor: Editor) {
        this._editor = editor;
    }

    shouldHandlerContinue = (event: ClipboardEvent) => {
        const filterNodes = ['INPUT', 'SELECT', 'TEXTAREA'];

        if (event.defaultPrevented) {
            return false;
        }
        if (filterNodes.includes((event.target as HTMLElement)?.tagName)) {
            return false;
        }

        return this._editor.selectionManager.currentSelectInfo.type !== 'None';
    };

    async getClipInfoOfBlockById(blockId: string) {
        const block = await this._editor.getBlockById(blockId);
        const blockInfo: ClipBlockInfo = {
            type: block.type,
            properties: block?.getProperties(),
            children: [] as ClipBlockInfo[],
        };
        const children = (await block?.children()) ?? [];

        await Promise.all(
            children.map(async childBlock => {
                const childInfo = await this.getClipInfoOfBlockById(
                    childBlock.id
                );
                blockInfo.children.push(childInfo);
            })
        );

        return blockInfo;
    }

    async getClipDataOfBlocksById(blockIds: string[]) {
        const clipInfos = await Promise.all(
            blockIds.map(blockId => this.getClipInfoOfBlockById(blockId))
        );

        return new Clip(
            OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
            JSON.stringify({
                data: clipInfos,
            })
        );
    }

    async getClipInfoOfBlockBySelectInfo(selectBlockInfo: SelectBlock) {
        const block = await this._editor.getBlockById(selectBlockInfo.blockId);
        const blockInfo: ClipBlockInfo = {
            type: block?.type,
            properties:
                await this._editor.blockHelper.getBlockPropertiesBySelectInfo(
                    selectBlockInfo
                ),
            // Editable has no children
            children: [],
        };
        return blockInfo;
    }

    async getClipDataOfBlocksBySelectInfo(selectInfo: SelectInfo) {
        const clipInfos = await Promise.all(
            selectInfo.blocks.map(selectBlockInfo =>
                this.getClipInfoOfBlockBySelectInfo(selectBlockInfo)
            )
        );
        return new Clip(
            OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
            JSON.stringify({
                data: clipInfos,
            })
        );
    }
}
