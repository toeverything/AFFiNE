/* eslint-disable max-lines */
import {
    OFFICE_CLIPBOARD_MIMETYPE,
    InnerClipInfo,
    ClipBlockInfo,
} from './types';
import { Editor } from '../editor';
import { AsyncBlock } from '../block';
import ClipboardParse from './clipboard-parse';
import { SelectInfo } from '../selection';
import {
    Protocol,
    BlockFlavorKeys,
    services,
} from '@toeverything/datasource/db-service';
import { MarkdownParser } from './markdown-parse';
import { shouldHandlerContinue } from './utils';
const SUPPORT_MARKDOWN_PASTE = true;

type TextValueItem = {
    text: string;
    [key: string]: any;
};

export class Paste {
    private _editor: Editor;
    private _markdownParse: MarkdownParser;
    private _clipboardParse: ClipboardParse;

    constructor(
        editor: Editor,
        clipboardParse: ClipboardParse,
        markdownParse: MarkdownParser
    ) {
        this._markdownParse = markdownParse;
        this._clipboardParse = clipboardParse;
        this._editor = editor;
        this.handlePaste = this.handlePaste.bind(this);
    }
    private static _optimalMimeType: string[] = [
        OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
        OFFICE_CLIPBOARD_MIMETYPE.HTML,
        OFFICE_CLIPBOARD_MIMETYPE.TEXT,
    ];
    public handlePaste(e: Event) {
        if (!shouldHandlerContinue(e, this._editor)) {
            return;
        }
        e.stopPropagation();

        const clipboardData = (e as ClipboardEvent).clipboardData;

        const isPureFile = Paste._isPureFileInClipboard(clipboardData);
        if (isPureFile) {
            this._pasteFile(clipboardData);
        } else {
            this._pasteContent(clipboardData);
        }
    }
    public getOptimalClip(clipboardData: any) {
        const mimeTypeArr = Paste._optimalMimeType;

        for (let i = 0; i < mimeTypeArr.length; i++) {
            const data =
                clipboardData[mimeTypeArr[i]] ||
                clipboardData.getData(mimeTypeArr[i]);

            if (data) {
                return {
                    type: mimeTypeArr[i],
                    data: data,
                };
            }
        }

        return '';
    }

    private _pasteContent(clipboardData: any) {
        const originClip: { data: any; type: any } = this.getOptimalClip(
            clipboardData
        ) as { data: any; type: any };

        const originTextClipData = clipboardData.getData(
            OFFICE_CLIPBOARD_MIMETYPE.TEXT
        );

        let clipData = originClip['data'];

        if (originClip['type'] === OFFICE_CLIPBOARD_MIMETYPE.TEXT) {
            clipData = Paste._excapeHtml(clipData);
        }

        switch (originClip['type']) {
            /** Protocol paste */
            case OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED:
                this._firePasteEditAction(clipData);
                break;
            case OFFICE_CLIPBOARD_MIMETYPE.HTML:
                this._pasteHtml(clipData, originTextClipData);
                break;
            case OFFICE_CLIPBOARD_MIMETYPE.TEXT:
                this._pasteText(clipData, originTextClipData);
                break;

            default:
                break;
        }
    }
    private async _firePasteEditAction(clipboardData: any) {
        const clipInfo: InnerClipInfo = JSON.parse(clipboardData);
        clipInfo && this._insertBlocks(clipInfo.data, clipInfo.select);
    }
    private async _pasteFile(clipboardData: any) {
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
            await this._insertBlocks([blockInfo]);
        }
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

    private static _isTextEditBlock(type: BlockFlavorKeys) {
        return (
            type === Protocol.Block.Type.page ||
            type === Protocol.Block.Type.text ||
            type === Protocol.Block.Type.heading1 ||
            type === Protocol.Block.Type.heading2 ||
            type === Protocol.Block.Type.heading3 ||
            type === Protocol.Block.Type.quote ||
            type === Protocol.Block.Type.todo ||
            type === Protocol.Block.Type.code ||
            type === Protocol.Block.Type.callout ||
            type === Protocol.Block.Type.numbered ||
            type === Protocol.Block.Type.bullet
        );
    }

    private async _insertBlocks(
        blocks: ClipBlockInfo[],
        pasteSelect?: SelectInfo
    ) {
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
            const isSelectedBlockCanEdit = Paste._isTextEditBlock(
                selectedBlock.type
            );
            const blockView = this._editor.getView(selectedBlock.type);
            const isSelectedBlockEmpty = blockView.isEmpty(selectedBlock);
            if (isSelectedBlockCanEdit && !isSelectedBlockEmpty) {
                const shouldSplitBlock =
                    blocks.length > 1 ||
                    !Paste._isTextEditBlock(blocks[0].type);
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
        const isBlockCanEdit = Paste._isTextEditBlock(block.type);
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

    private async _pasteHtml(clipData: any, originTextClipData: any) {
        if (SUPPORT_MARKDOWN_PASTE) {
            const hasMarkdown =
                this._markdownParse.checkIfTextContainsMd(originTextClipData);
            if (hasMarkdown) {
                try {
                    const convertedDataObj =
                        this._markdownParse.md2Html(originTextClipData);
                    if (convertedDataObj.isConverted) {
                        clipData = convertedDataObj.text;
                    }
                } catch (e) {
                    console.error(e);
                    clipData = originTextClipData;
                }
            }
        }

        const blocks = this._clipboardParse.html2blocks(clipData);

        await this._insertBlocks(blocks);
    }

    private async _pasteText(clipData: any, originTextClipData: any) {
        const blocks = this._clipboardParse.text2blocks(clipData);
        await this._insertBlocks(blocks);
    }

    private static _getImageFile(clipboardData: any) {
        const files = clipboardData.files;
        if (files && files[0] && files[0].type.indexOf('image') > -1) {
            return files[0];
        }
        return;
    }

    private static _excapeHtml(data: any, onlySpace?: any) {
        if (!onlySpace) {
            // TODO:
            // data = string.htmlEscape(data);
            // data = data.replace(/\n/g, '<br>');
        }

        // data = data.replace(/ /g, '&nbsp;');
        // data = data.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
        return data;
    }
}
