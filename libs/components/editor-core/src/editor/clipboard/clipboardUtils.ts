import { Editor } from '../editor';
import {
    AsyncBlock,
    SelectBlock,
    SelectInfo,
} from '@toeverything/components/editor-core';
import { ClipBlockInfo, OFFICE_CLIPBOARD_MIMETYPE } from './types';
import { Clip } from './clip';
import { commonHTML2Block, commonHTML2Text } from './utils';

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

    async convertTextValue2HtmlBySelectInfo(
        blockOrBlockId: AsyncBlock | string,
        selectBlockInfo?: SelectBlock
    ) {
        const block =
            typeof blockOrBlockId === 'string'
                ? await this._editor.getBlockById(blockOrBlockId)
                : blockOrBlockId;
        const selectedProperties =
            await this._editor.blockHelper.getEditableBlockPropertiesBySelectInfo(
                block,
                selectBlockInfo
            );
        return this._editor.blockHelper.convertTextValue2Html(
            block.id,
            selectedProperties.text.value
        );
    }
    async convertBlock2HtmlBySelectInfos(
        blockOrBlockId: AsyncBlock | string,
        selectBlockInfos?: SelectBlock[]
    ) {
        if (!selectBlockInfos) {
            const block =
                typeof blockOrBlockId === 'string'
                    ? await this._editor.getBlockById(blockOrBlockId)
                    : blockOrBlockId;
            const children = await block?.children();
            return (
                await Promise.all(
                    children.map(async childBlock => {
                        const blockView = this._editor.getView(childBlock.type);
                        return await blockView.block2html({
                            editor: this._editor,
                            block: childBlock,
                        });
                    })
                )
            ).join('');
        }

        return (
            await Promise.all(
                selectBlockInfos.map(async selectBlockInfo => {
                    const block = await this._editor.getBlockById(
                        selectBlockInfo.blockId
                    );
                    const blockView = this._editor.getView(block.type);
                    return await blockView.block2html({
                        editor: this._editor,
                        block,
                        selectInfo: selectBlockInfo,
                    });
                })
            )
        ).join('');
    }

    async convertHTMLString2Blocks(html: string): Promise<ClipBlockInfo[]> {
        const htmlEl = document.createElement('html');
        htmlEl.innerHTML = html;
        htmlEl.querySelector('head')?.remove();

        return this.convertHtml2Blocks(htmlEl);
    }
    async convertHtml2Blocks(element: Element): Promise<ClipBlockInfo[]> {
        const editableViews = this._editor.getEditableViews();
        // 如果block能够捕捉htmlElement则返回block的html2block
        const [clipBlockInfos] = (
            await Promise.all(
                editableViews.map(editableView => {
                    return editableView?.html2block2?.({
                        editor: this._editor,
                        element: element,
                    });
                })
            )
        ).filter(v => v && v.length);

        if (clipBlockInfos) {
            return clipBlockInfos;
        }
        return (
            await Promise.all(
                Array.from(element.children).map(async childElement => {
                    const clipBlockInfos = await this.convertHtml2Blocks(
                        childElement
                    );

                    if (clipBlockInfos && clipBlockInfos.length) {
                        return clipBlockInfos;
                    }

                    return this.commonHTML2Block(childElement);
                })
            )
        )
            .flat()
            .filter(v => v);
    }

    commonHTML2Block = commonHTML2Block;

    commonHTML2Text = commonHTML2Text;

    textToBlock = (clipData: string = ''): ClipBlockInfo[] => {
        return clipData.split('\n').map((str: string) => {
            return {
                type: 'text',
                properties: {
                    text: { value: [{ text: str }] },
                },
                children: [],
            };
        });
    };

    async page2html() {
        const rootBlockId = this._editor.getRootBlockId();
        if (!rootBlockId) {
            return '';
        }
        const rootBlock = await this._editor.getBlockById(rootBlockId);
        const blockView = this._editor.getView(rootBlock.type);

        return await blockView.block2html({
            editor: this._editor,
            block: rootBlock,
        });
    }
}
