import type {
    fontColorPalette,
    SlateUtils,
    TextAlignOptions,
} from '@toeverything/components/common';
import { Point, Selection as SlateSelection } from 'slate';
import { Editor } from '../editor';

type TextUtilsFunctions =
    | 'getString'
    | 'getStringBetweenStartAndSelection'
    | 'getStringBetweenSelection'
    | 'setSearchSlash'
    | 'removeSearchSlash'
    | 'getSearchSlashText'
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
    | 'insertReference'
    | 'isCollapsed'
    | 'blur';

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

    public getBlockTextBetweenSelection(blockId: string) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            return text_utils.getStringBetweenSelection(true);
        }
        console.warn('Could find the block text utils');
        return '';
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

    public insertReference(
        reference: string,
        blockId: string,
        selection: Selection,
        offset: number
    ) {
        const text_utils = this._blockTextUtilsMap[blockId];
        if (text_utils) {
            const offsetSelection = window.getSelection();
            offsetSelection.setBaseAndExtent(
                selection.anchorNode,
                selection.anchorOffset,
                selection.focusNode,
                selection.focusOffset + offset
            );

            text_utils.removeSelection(offsetSelection);
            text_utils.insertReference(reference);

            // range.
            // text_utils.toggleTextFormatBySelection(format, range);
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
