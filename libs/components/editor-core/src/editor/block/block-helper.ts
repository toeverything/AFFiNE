import type {
    fontColorPalette,
    SlateUtils,
    TextAlignOptions,
} from '@toeverything/components/common';
import {
    BaseRange,
    Node,
    Path,
    Point,
    Selection as SlateSelection,
} from 'slate';
import { Editor } from '../editor';
import { AsyncBlock } from '../block';
import { SelectBlock } from '../selection';

type TextUtilsFunctions =
    | 'getString'
    | 'getStringBetweenStartAndSelection'
    | 'getStringBetweenSelection'
    | 'setSearchSlash'
    | 'removeSearchSlash'
    | 'getSearchSlashText'
    | 'setDoubleLinkSearchSlash'
    | 'getDoubleLinkSearchSlashText'
    | 'setSelectDoubleLinkSearchSlash'
    | 'removeDoubleLinkSearchSlash'
    | 'insertDoubleLink'
    | 'selectionToSlateRange'
    | 'transformPoint'
    | 'toggleTextFormatBySelection'
    | 'isTextFormatActive'
    | 'setLinkModalVisible'
    | 'setParagraphAlignBySelection'
    | 'setTextFontColorBySelection'
    | 'setTextFontBgColorBySelection'
    | 'setCommentBySelection'
    | 'resolveCommentById'
    | 'getCommentsIdsBySelection'
    | 'getCurrentSelection'
    | 'removeSelection'
    | 'isCollapsed'
    | 'blur'
    | 'setSelection'
    | 'insertNodes'
    | 'getNodeByPath'
    | 'getNodeByRange'
    | 'convertLeaf2Html';

type ExtendedTextUtils = SlateUtils & {
    setLinkModalVisible: (visible: boolean) => void;
};

type TextUtils = { [K in TextUtilsFunctions]: ExtendedTextUtils[K] };

/**
 *
 * block helper aim to get block`s self infos
 * @class BlockHelper
 */
export class BlockHelper {
    private _editor: Editor;
    private _blockTextUtilsMap: Record<string, TextUtils> = {};

    constructor(editor: Editor) {
        this._editor = editor;
    }

    public registerTextUtils(blockId: string, utils: ExtendedTextUtils) {
        this._blockTextUtilsMap[blockId] = utils;
    }

    public unRegisterTextUtils(blockId: string) {
        delete this._blockTextUtilsMap[blockId];
    }

    public hasBlockTextUtils(blockId: string) {
        return !!this._blockTextUtilsMap[blockId];
    }

    /**
     *
     * get block serializer text by block id
     * @memberof BlockHelper
     */
    public getBlockText(blockId: string) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.getString();
        }
        console.warn('Could find the block text utils');
        return '';
    }

    /**
     *
     * get serializer text between start and end selection by block id
     * @memberof BlockHelper
     */
    public getBlockTextBeforeSelection(blockId: string) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.getStringBetweenStartAndSelection();
        }
        console.warn('Could find the block text utils');
        return '';
    }

    public async isBlockEditable(blockOrBlockId: AsyncBlock | string) {
        const block =
            typeof blockOrBlockId === 'string'
                ? await this._editor.getBlockById(blockOrBlockId)
                : blockOrBlockId;
        const blockView = this._editor.getView(block.type);

        return blockView.editable;
    }

    public async getFlatBlocksUnderParent(
        parentBlockId: string,
        includeParent = false
    ): Promise<AsyncBlock[]> {
        const blocks = [];
        const block = await this._editor.getBlockById(parentBlockId);
        if (includeParent) {
            blocks.push(block);
        }
        const children = await block.children();
        (
            await Promise.all(
                children.map(child => {
                    return this.getFlatBlocksUnderParent(child.id, true);
                })
            )
        ).forEach(editableChildren => {
            blocks.push(...editableChildren);
        });
        return blocks;
    }

    public getBlockTextBetweenSelection(
        blockId: string,
        shouldUsePreviousSelection = true
    ) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.getStringBetweenSelection(
                shouldUsePreviousSelection
            );
        }
        console.warn('Could find the block text utils');
        return '';
    }

    public async getEditableBlockPropertiesBySelectInfo(
        block: AsyncBlock,
        selectInfo?: SelectBlock
    ) {
        const properties = block.getProperties();
        if (properties.text.value.length === 0) {
            return properties;
        }
        let text_value = properties.text.value;

        const {
            text: { value: originTextValue, ...otherTextProperties },
            ...otherProperties
        } = properties;

        // Use deepClone method will throw incomprehensible error
        let textValue = JSON.parse(JSON.stringify(originTextValue));

        if (selectInfo?.endInfo) {
            textValue = textValue.slice(0, selectInfo.endInfo.arrayIndex + 1);
            textValue[textValue.length - 1].text = text_value[
                textValue.length - 1
            ].text.substring(0, selectInfo.endInfo.offset);
        }
        if (selectInfo?.startInfo) {
            textValue = textValue.slice(selectInfo.startInfo.arrayIndex);
            textValue[0].text = textValue[0].text.substring(
                selectInfo.startInfo.offset
            );
        }
        return {
            ...otherProperties,
            text: {
                ...otherTextProperties,
                value: textValue,
            },
        };
    }

    // For editable blocks, the properties containing the selected text will be returned with the selection information
    public async getBlockPropertiesBySelectInfo(selectBlockInfo: SelectBlock) {
        const block = await this._editor.getBlockById(selectBlockInfo.blockId);
        const blockView = this._editor.getView(block.type);
        if (blockView.editable) {
            return this.getEditableBlockPropertiesBySelectInfo(
                block,
                selectBlockInfo
            );
        } else {
            return block?.getProperties();
        }
    }

    public convertTextValue2Html(blockId: string, textValue: any) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (!text_utils) {
            return '';
        }
        return textValue.reduce((html: string, textValueItem: any) => {
            const fragment = text_utils.convertLeaf2Html(textValueItem);
            return `${html}${fragment}`;
        }, '');
    }

    public setBlockBlur(blockId: string) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.blur();
        }
        console.warn('Could find the block text utils');
        return '';
    }

    /**
     *
     * set slash character into a special node
     * @param {string} blockId
     * @param {Point} point
     * @memberof BlockHelper
     */
    public setSearchSlash(blockId: string, point: Point) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            text_utils.setSearchSlash(point);
        } else {
            console.warn('Could find the block text utils');
        }
    }

    /**
     *
     * change slash node back to normal node,
     * if afferent remove flash remove slash symbol
     * @param {string} blockId
     * @param {boolean} [isRemoveSlash]
     * @memberof BlockHelper
     */
    public removeSearchSlash(blockId: string, isRemoveSlash?: boolean) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            text_utils.removeSearchSlash(isRemoveSlash);
        } else {
            console.warn('Could find the block text utils');
        }
    }

    public setDoubleLinkSearchSlash(blockId: string, point: Point) {
        const textUtils = this._blockTextUtilsMap[blockId];
        if (textUtils) {
            textUtils.setDoubleLinkSearchSlash(point);
        } else {
            console.warn('Could find the block text utils');
        }
    }

    public getDoubleLinkSearchSlashText(blockId: string) {
        const textUtils = this._blockTextUtilsMap[blockId];
        if (textUtils) {
            return textUtils.getDoubleLinkSearchSlashText();
        }
        console.warn('Could find the block text utils');
        return '';
    }
    public setSelectDoubleLinkSearchSlash(blockId: string) {
        const textUtils = this._blockTextUtilsMap[blockId];
        if (textUtils) {
            return textUtils.setSelectDoubleLinkSearchSlash();
        }
        console.warn('Could find the block text utils');
        return '';
    }

    public removeDoubleLinkSearchSlash(
        blockId: string,
        isRemoveSlash?: boolean
    ) {
        const textUtils = this._blockTextUtilsMap[blockId];
        if (textUtils) {
            textUtils.removeDoubleLinkSearchSlash(isRemoveSlash);
        } else {
            console.warn('Could find the block text utils');
        }
    }

    public async insertDoubleLink(
        workspaceId: string,
        linkBlockId: string,
        blockId: string
    ) {
        const textUtils = this._blockTextUtilsMap[blockId];
        if (textUtils) {
            const linkBlock = await this._editor.getBlock({
                workspace: workspaceId,
                id: linkBlockId,
            });
            let children = linkBlock.getProperties().text?.value || [];
            if (children.length === 1 && !children[0].text) {
                children = [{ text: 'Untitled' }];
            }
            textUtils.insertDoubleLink(workspaceId, linkBlockId, children);
        }
        console.warn('Could find the block text utils');
    }

    /**
     *
     * convert browser selection to slate rang
     * @memberof BlockHelper
     */
    public selectionToSlateRange(blockId: string, selection: Selection) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.selectionToSlateRange(selection);
        }
        console.warn('Could find the block text utils');
        return undefined;
    }

    /**
     *
     * get special slash node`s text
     * @memberof BlockHelper
     */
    public getSearchSlashText(blockId: string) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.getSearchSlashText();
        }
        console.warn('Could find the block text utils');
        return '';
    }

    /**
     *
     * set selection of a text input
     * @param {string} blockId
     * @param {BaseRange} selection
     * @return {*}
     * @memberof BlockHelper
     */
    public setSelection(blockId: string, selection: BaseRange) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.setSelection(selection);
        }
        console.warn('Could find the block text utils');
    }

    /**
     *
     * insert nodes in text
     * @param {string} blockId
     * @param {Array<Node>} nodes
     * @param {Parameters<TextUtils['insertNodes']>[1]} options
     * @return {*}
     * @memberof BlockHelper
     */
    public insertNodes(
        blockId: string,
        nodes: Array<Node>,
        options?: Parameters<TextUtils['insertNodes']>[1]
    ) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.insertNodes(nodes, options);
        }
        console.warn('Could find the block text utils');
    }

    /**
     *
     * get text(slate node) by path
     * @param {string} blockId
     * @param {Path} path
     * @return {*}
     * @memberof BlockHelper
     */
    public getNodeByPath(blockId: string, path: Path) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.getNodeByPath(path);
        }
        console.warn('Could find the block text utils');
    }

    public transformPoint(
        blockId: string,
        ...restArgs: Parameters<TextUtils['transformPoint']>
    ) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.transformPoint(...restArgs);
        }
        console.warn('Could find the block text utils');
        return undefined;
    }

    public toggleTextFormatBySelection(
        blockId: string,
        format: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'inlinecode'
    ) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.toggleTextFormatBySelection(format);
        }
        console.warn('Could find the block text utils');
    }

    public setLinkModalVisible(blockId: string, visible: boolean) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.setLinkModalVisible(visible);
        }
        console.warn('Could find the block text utils');
    }

    public setParagraphAlign(blockId: string, format: TextAlignOptions) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.setParagraphAlignBySelection(format, true);
        }
        console.warn('Could find the block text utils');
    }

    public setTextFontColor(
        blockId: string,
        color: keyof typeof fontColorPalette
    ) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.setTextFontColorBySelection(color, true);
        }
        console.warn('Could find the block text utils');
    }

    public setTextFontBgColor(
        blockId: string,
        bgColor: keyof typeof fontColorPalette
    ) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.setTextFontBgColorBySelection(bgColor, true);
        }
        console.warn('Could find the block text utils');
    }

    public addComment(blockId: string, commentId: string) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.setCommentBySelection(commentId);
        }
        console.warn('Could find the block text utils');
    }

    public resolveComment(blockId: string, commentId: string) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.resolveCommentById(commentId);
        }
        console.warn('Could find the block text utils');
    }

    public async getBlockDragImg(blockId: string) {
        let blockImg;
        const block = await this._editor.getBlockById(blockId);
        if (block) {
            blockImg = block.dom;
        }
        return blockImg;
    }

    public blur(blockId: string) {
        const textUtils = this._blockTextUtilsMap[blockId];
        if (textUtils != null) {
            textUtils.blur();
        }
    }

    public getCurrentSelection(blockId: string): SlateSelection {
        const textUtils = this._blockTextUtilsMap[blockId];
        if (textUtils) {
            return textUtils.getCurrentSelection();
        }

        console.warn('Could find the block text utils');
        return undefined as SlateSelection;
    }

    public isSelectionCollapsed(blockId: string): boolean | undefined {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.isCollapsed();
        }
        console.warn('Could find the block text utils');
        return undefined;
    }

    public getCommentsIdsBySelection(blockId: string): string[] {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.getCommentsIdsBySelection();
        }
        console.warn('Could find the block text utils');
        return undefined;
    }
}
