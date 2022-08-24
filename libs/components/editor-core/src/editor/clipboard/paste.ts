/* eslint-disable max-lines */
import {
    OFFICE_CLIPBOARD_MIMETYPE,
    InnerClipInfo,
    ClipBlockInfo,
} from './types';
import { Editor } from '../editor';
import { AsyncBlock } from '../block';
import { services } from '@toeverything/datasource/db-service';
import { MarkdownParser } from './markdown-parse';
import { escape } from 'html-escaper';
import { marked } from 'marked';
import { ClipboardUtils } from './clipboardUtils';
type TextValueItem = {
    text: string;
    [key: string]: any;
};

export class Paste {
    private _editor: Editor;
    private _markdownParse: MarkdownParser;
    private _utils: ClipboardUtils;
    constructor(editor: Editor) {
        this._markdownParse = new MarkdownParser();
        this._editor = editor;

        this._utils = new ClipboardUtils(editor);
        this.handlePaste = this.handlePaste.bind(this);
    }
    // The event handler will get the most needed clipboard data based on this array order
    private static _optimalMimeTypes: string[] = [
        OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
        OFFICE_CLIPBOARD_MIMETYPE.HTML,
        OFFICE_CLIPBOARD_MIMETYPE.TEXT,
    ];

    public async handlePaste(e: ClipboardEvent) {
        e.stopPropagation();

        const blocks = await this.clipboardEvent2Blocks(e);
        await this._insertBlocks(blocks);
    }

    public async clipboardEvent2Blocks(e: ClipboardEvent) {
        const clipboardData = e.clipboardData;
        const isPureFile = Paste._isPureFileInClipboard(clipboardData);

        if (isPureFile) {
            return this._file2Blocks(clipboardData);
        }
        return this._clipboardData2Blocks(clipboardData);
    }
    // Get the most needed clipboard data based on `_optimalMimeTypes` order
    public getOptimalClip(clipboardData: ClipboardEvent['clipboardData']) {
        for (let i = 0; i < Paste._optimalMimeTypes.length; i++) {
            const mimeType = Paste._optimalMimeTypes[i];
            const data = clipboardData.getData(mimeType);

            if (data) {
                return {
                    type: mimeType,
                    data: data,
                };
            }
        }

        return null;
    }

    private async _clipboardData2Blocks(
        clipboardData: ClipboardEvent['clipboardData']
    ): Promise<ClipBlockInfo[]> {
        const optimalClip = this.getOptimalClip(clipboardData);
        if (
            optimalClip?.type ===
            OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED
        ) {
            const clipInfo: InnerClipInfo = JSON.parse(optimalClip.data);
            return clipInfo.data;
        }

        const textClipData = escape(
            clipboardData.getData(OFFICE_CLIPBOARD_MIMETYPE.TEXT)
        );

        const shouldConvertMarkdown =
            this._markdownParse.checkIfTextContainsMd(textClipData);

        if (
            optimalClip?.type === OFFICE_CLIPBOARD_MIMETYPE.HTML &&
            !shouldConvertMarkdown
        ) {
            return this._utils.convertHTMLString2Blocks(optimalClip.data);
        }

        if (shouldConvertMarkdown) {
            const md2html = marked.parse(textClipData);
            return this._utils.convertHTMLString2Blocks(md2html);
        }

        return this._utils.textToBlock(textClipData);
    }

    private async _file2Blocks(clipboardData: any): Promise<ClipBlockInfo[]> {
        const file = Paste._getImageFile(clipboardData);
        if (file) {
            const result = await services.api.file.create({
                workspace: this._editor.workspace,
                file: file,
            });
            const blockInfo: ClipBlockInfo = {
                type: 'image',
                properties: {
                    image: {
                        value: result.id,
                        name: file.name,
                        size: file.size,
                        type: file.type,
                    },
                },
                children: [] as ClipBlockInfo[],
            };
            return [blockInfo];
        }
        return [];
    }
    private static _isPureFileInClipboard(clipboardData: DataTransfer) {
        const types = clipboardData.types;

        return (
            (types.length === 1 && types[0] === 'Files') ||
            (types.length === 2 &&
                (types.includes('text/plain') || types.includes('text/html')) &&
                types.includes('Files'))
        );
    }

    private async _insertBlocks(blocks: ClipBlockInfo[]) {
        if (blocks.length === 0) {
            return;
        }
        const currentSelectInfo =
            await this._editor.selectionManager.getSelectInfo();

        // When the selection is in one of the blocks, select?.type === 'Range'
        // Currently the selection does not support cross-blocking, so this case is not considered
        if (currentSelectInfo.type === 'Range') {
            // 当 currentSelectInfo.type === 'Range' 时，光标选中的block必然只有一个
            const selectedBlock = await this._editor.getBlockById(
                currentSelectInfo.blocks[0].blockId
            );
            const isSelectedBlockCanEdit = this._editor.isEditableView(
                selectedBlock?.type
            );

            const blockView = this._editor.getView(selectedBlock.type);
            const isSelectedBlockEmpty = blockView.isEmpty(selectedBlock);
            if (isSelectedBlockCanEdit && !isSelectedBlockEmpty) {
                const shouldSplitBlock =
                    blocks.length > 1 ||
                    !this._editor.isEditableView(blocks[0].type);
                const pureText = !shouldSplitBlock
                    ? blocks[0].properties.text.value
                    : [{ text: '' }];
                const { startInfo, endInfo } = currentSelectInfo.blocks[0];

                // Text content of the selected current editable block
                const currentTextValue =
                    selectedBlock.getProperty('text').value;
                // When the cursor selection spans different styles of text
                if (startInfo?.arrayIndex !== endInfo?.arrayIndex) {
                    if (shouldSplitBlock) {
                        // TODO: split block maybe should use slate method to support, like "this._editor.blockHelper.insertNodes"
                        const newTextValue = currentTextValue.reduce(
                            (
                                newTextValue: TextValueItem[],
                                textStore: TextValueItem,
                                i: number
                            ) => {
                                if (i < startInfo?.arrayIndex) {
                                    newTextValue.push(textStore);
                                }
                                const { text, ...props } = textStore;

                                if (i === startInfo?.arrayIndex) {
                                    newTextValue.push({
                                        text: text.slice(0, startInfo?.offset),
                                        ...props,
                                    });
                                }
                                return newTextValue;
                            },
                            []
                        );
                        const nextTextValue = currentTextValue.reduce(
                            (
                                newTextValue: TextValueItem[],
                                textStore: TextValueItem,
                                i: number
                            ) => {
                                if (i > endInfo?.arrayIndex) {
                                    newTextValue.push(textStore);
                                }
                                const { text, ...props } = textStore;

                                if (i === endInfo?.arrayIndex) {
                                    newTextValue.push({
                                        text: text.slice(endInfo?.offset),
                                        ...props,
                                    });
                                }
                                return newTextValue;
                            },
                            []
                        );

                        await selectedBlock.setProperties({
                            text: {
                                value: newTextValue,
                            },
                        });
                        const pastedBlocks = await this._createBlocks(blocks);

                        const nextBlock = await this._editor.createBlock(
                            selectedBlock?.type
                        );
                        nextBlock.setProperties({
                            text: {
                                value: nextTextValue,
                            },
                        });

                        await this._insertBlocksAfterBlock(selectedBlock, [
                            ...pastedBlocks,
                            nextBlock,
                        ]);
                        await this._setEndSelectToBlock(nextBlock.id);
                    } else {
                        this._editor.blockHelper.insertNodes(
                            selectedBlock.id,
                            pureText,
                            { select: true }
                        );
                    }
                }
                // When the cursor selection does not span different styles of text
                if (startInfo?.arrayIndex === endInfo?.arrayIndex) {
                    if (shouldSplitBlock) {
                        // TODO: split block maybe should use slate method to support, like "this._editor.blockHelper.insertNodes"
                        const newTextValue = currentTextValue.reduce(
                            (
                                newTextValue: TextValueItem[],
                                textStore: TextValueItem,
                                i: number
                            ) => {
                                if (i < startInfo?.arrayIndex) {
                                    newTextValue.push(textStore);
                                }
                                const { text, ...props } = textStore;

                                if (i === startInfo?.arrayIndex) {
                                    newTextValue.push({
                                        text: `${text.slice(
                                            0,
                                            startInfo?.offset
                                        )}`,
                                        ...props,
                                    });
                                }
                                return newTextValue;
                            },
                            []
                        );

                        const nextTextValue = currentTextValue.reduce(
                            (
                                nextTextValue: TextValueItem[],
                                textStore: TextValueItem,
                                i: number
                            ) => {
                                if (i > endInfo?.arrayIndex) {
                                    nextTextValue.push(textStore);
                                }
                                const { text, ...props } = textStore;

                                if (i === endInfo?.arrayIndex) {
                                    nextTextValue.push({
                                        text: `${text.slice(endInfo?.offset)}`,
                                        ...props,
                                    });
                                }
                                return nextTextValue;
                            },
                            []
                        );
                        selectedBlock.setProperties({
                            text: {
                                value: newTextValue,
                            },
                        });
                        const pastedBlocks = await this._createBlocks(blocks);
                        const nextBlock = await this._editor.createBlock(
                            selectedBlock?.type
                        );
                        nextBlock.setProperties({
                            text: {
                                value: nextTextValue,
                            },
                        });
                        await this._insertBlocksAfterBlock(selectedBlock, [
                            ...pastedBlocks,
                            nextBlock,
                        ]);

                        await this._setEndSelectToBlock(nextBlock.id);
                    } else {
                        this._editor.blockHelper.insertNodes(
                            selectedBlock.id,
                            pureText,
                            { select: true }
                        );
                    }
                }
            } else {
                const pastedBlocks = await this._createBlocks(blocks);

                await Promise.all(
                    pastedBlocks.map(block => selectedBlock.after(block))
                );

                if (isSelectedBlockEmpty) {
                    selectedBlock?.remove();
                }

                this._setEndSelectToBlock(
                    pastedBlocks[pastedBlocks.length - 1].id
                );
            }
        }

        if (currentSelectInfo.type === 'Block') {
            const selectedBlock = await this._editor.getBlockById(
                currentSelectInfo.blocks[currentSelectInfo.blocks.length - 1]
                    .blockId
            );
            const pastedBlocks = await this._createBlocks(blocks);

            let groupBlock: AsyncBlock;
            if (selectedBlock?.type === 'page') {
                groupBlock = await this._editor.createBlock('group');
                await Promise.all(
                    pastedBlocks.map(block => groupBlock.append(block))
                );
                await selectedBlock.after(groupBlock);
            } else if (selectedBlock?.type === 'group') {
                await Promise.all(
                    pastedBlocks.map(block => selectedBlock.append(block))
                );
            } else {
                await Promise.all(
                    pastedBlocks.map(block => selectedBlock.after(block))
                );
            }
            this._setEndSelectToBlock(pastedBlocks[pastedBlocks.length - 1].id);
        }
    }

    private async _insertBlocksAfterBlock(
        targetBlock: AsyncBlock,
        blocks: AsyncBlock[]
    ) {
        if (blocks.length === 0) {
            return;
        }
        const [firstBlock, ...otherBlock] = blocks;
        await targetBlock.after(firstBlock);
        await this._insertBlocksAfterBlock(blocks[0], otherBlock);
    }
    private async _setEndSelectToBlock(blockId: string) {
        const block = await this._editor.getBlockById(blockId);
        const isBlockCanEdit = this._editor.isEditableView(block.type);
        if (!isBlockCanEdit) {
            return;
        }
        setTimeout(() => {
            this._editor.selectionManager.activeNodeByNodeId(blockId, 'end');
        }, 100);
    }

    private _flatGroupBlocks(blocks: ClipBlockInfo[]) {
        return blocks.reduce(
            (blockList: ClipBlockInfo[], block: ClipBlockInfo) => {
                if (block.type === 'group') {
                    block?.children?.forEach(childBlock => {
                        childBlock.children = this._flatGroupBlocks(
                            childBlock.children
                        );
                    });
                    block?.children?.length &&
                        blockList.push(...block.children);
                } else {
                    blockList.push(block);
                    block.children = this._flatGroupBlocks(block.children);
                }
                return blockList;
            },
            []
        );
    }
    private async _createBlocks(blocks: ClipBlockInfo[]) {
        return Promise.all(
            this._flatGroupBlocks(blocks).map(async clipBlockInfo => {
                const block = await this._editor.createBlock(
                    clipBlockInfo.type
                );
                block?.setProperties(clipBlockInfo.properties);
                const children = await this._createBlocks(
                    clipBlockInfo.children
                );
                await Promise.all(children.map(child => block?.append(child)));
                return block;
            })
        );
    }

    private static _getImageFile(clipboardData: any) {
        const files = clipboardData.files;
        if (files && files[0] && files[0].type.indexOf('image') > -1) {
            return files[0];
        }
        return;
    }
}
