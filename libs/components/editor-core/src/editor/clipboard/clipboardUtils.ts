import { Editor } from '../editor';
import {
    AsyncBlock,
    SelectBlock,
    SelectInfo,
} from '@toeverything/components/editor-core';
import { ClipBlockInfo, OFFICE_CLIPBOARD_MIMETYPE } from './types';
import { getClipInfoOfBlockById } from './utils';
import { Clip } from './clip';

export class ClipboardUtils {
    private _editor: Editor;
    constructor(editor: Editor) {
        this._editor = editor;
    }

    async isBlockEditable(blockOrBlockId: AsyncBlock | string) {
        const block =
            typeof blockOrBlockId === 'string'
                ? await this._editor.getBlockById(blockOrBlockId)
                : blockOrBlockId;
        const blockView = this._editor.getView(block.type);

        return blockView.activatable;
    }

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

    async convertEditableBlockToHtml(block: AsyncBlock) {
        const generate = (textList: any[]) => {
            let content = '';
            textList.forEach(text_obj => {
                let text = text_obj.text || '';
                if (text_obj.bold) {
                    text = `<strong>${text}</strong>`;
                }
                if (text_obj.italic) {
                    text = `<em>${text}</em>`;
                }
                if (text_obj.underline) {
                    text = `<u>${text}</u>`;
                }
                if (text_obj.inlinecode) {
                    text = `<code>${text}</code>`;
                }
                if (text_obj.strikethrough) {
                    text = `<s>${text}</s>`;
                }
                if (text_obj.type === 'link') {
                    text = `<a href='${text_obj.url}'>${generate(
                        text_obj.children
                    )}</a>`;
                }
                content += text;
            });
            return content;
        };
        const text_list: any[] = block.getProperty('text').value;
        return generate(text_list);
    }
}
