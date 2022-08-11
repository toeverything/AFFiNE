import { HooksRunner } from '../types';
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

// todo needs to be a switch
const SUPPORT_MARKDOWN_PASTE = true;

const shouldHandlerContinue = (event: Event, editor: Editor) => {
    const filterNodes = ['INPUT', 'SELECT', 'TEXTAREA'];

    if (event.defaultPrevented) {
        return false;
    }
    if (filterNodes.includes((event.target as HTMLElement)?.tagName)) {
        return false;
    }

    return editor.selectionManager.currentSelectInfo.type !== 'None';
};

enum ClipboardAction {
    COPY = 'copy',
    CUT = 'cut',
    PASTE = 'paste',
}
class BrowserClipboard {
    private _eventTarget: Element;
    private _hooks: HooksRunner;
    private _editor: Editor;
    private _clipboardParse: ClipboardParse;
    private _markdownParse: MarkdownParser;

    private static _optimalMimeType: string[] = [
        OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
        OFFICE_CLIPBOARD_MIMETYPE.HTML,
        OFFICE_CLIPBOARD_MIMETYPE.TEXT,
    ];

    constructor(eventTarget: Element, hooks: HooksRunner, editor: Editor) {
        this._eventTarget = eventTarget;
        this._hooks = hooks;
        this._editor = editor;
        this._clipboardParse = new ClipboardParse(editor);
        this._markdownParse = new MarkdownParser();
        this._initialize();
    }

    public getClipboardParse() {
        return this._clipboardParse;
    }

    private _initialize() {
        this._handleCopy = this._handleCopy.bind(this);
        this._handleCut = this._handleCut.bind(this);
        this._handlePaste = this._handlePaste.bind(this);

        document.addEventListener(ClipboardAction.COPY, this._handleCopy);
        document.addEventListener(ClipboardAction.CUT, this._handleCut);
        document.addEventListener(ClipboardAction.PASTE, this._handlePaste);
        this._eventTarget.addEventListener(
            ClipboardAction.COPY,
            this._handleCopy
        );
        this._eventTarget.addEventListener(
            ClipboardAction.CUT,
            this._handleCut
        );
        this._eventTarget.addEventListener(
            ClipboardAction.PASTE,
            this._handlePaste
        );
    }

    private _handleCopy(e: Event) {
        if (!shouldHandlerContinue(e, this._editor)) {
            return;
        }

        this._dispatchClipboardEvent(ClipboardAction.COPY, e as ClipboardEvent);
    }

    private _handleCut(e: Event) {
        if (!shouldHandlerContinue(e, this._editor)) {
            return;
        }

        this._dispatchClipboardEvent(ClipboardAction.CUT, e as ClipboardEvent);
    }

    private _handlePaste(e: Event) {
        if (!shouldHandlerContinue(e, this._editor)) {
            return;
        }
        e.stopPropagation();

        const clipboardData = (e as ClipboardEvent).clipboardData;

        const isPureFile = this._isPureFileInClipboard(clipboardData);

        if (isPureFile) {
            this._pasteFile(clipboardData);
        } else {
            this._pasteContent(clipboardData);
        }
        // this._editor.selectionManager
        //     .getSelectInfo()
        //     .then(selectionInfo => console.log(selectionInfo));
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
            clipData = this._excapeHtml(clipData);
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

    private _pasteHtml(clipData: any, originTextClipData: any) {
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
        this.insert_blocks(blocks);
    }

    private _pasteText(clipData: any, originTextClipData: any) {
        const blocks = this._clipboardParse.text2blocks(clipData);
        this.insert_blocks(blocks);
    }

    private async _pasteFile(clipboardData: any) {
        const file = this._getImageFile(clipboardData);
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
            this.insert_blocks([blockInfo]);
        }
    }

    private _getImageFile(clipboardData: any) {
        const files = clipboardData.files;
        if (files && files[0] && files[0].type.indexOf('image') > -1) {
            return files[0];
        }
        return;
    }

    private _excapeHtml(data: any, onlySpace?: any) {
        if (!onlySpace) {
            // TODO:
            // data = string.htmlEscape(data);
            // data = data.replace(/\n/g, '<br>');
        }

        // data = data.replace(/ /g, '&nbsp;');
        // data = data.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
        return data;
    }

    public getOptimalClip(clipboardData: any) {
        const mimeTypeArr = BrowserClipboard._optimalMimeType;

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

    private _isPureFileInClipboard(clipboardData: DataTransfer) {
        const types = clipboardData.types;

        return (
            (types.length === 1 && types[0] === 'Files') ||
            (types.length === 2 &&
                (types.includes('text/plain') || types.includes('text/html')) &&
                types.includes('Files'))
        );
    }

    private async _firePasteEditAction(clipboardData: any) {
        const clipInfo: InnerClipInfo = JSON.parse(clipboardData);
        clipInfo && this.insert_blocks(clipInfo.data, clipInfo.select);
    }

    private _canEditText(type: BlockFlavorKeys) {
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

    // TODO: cursor positioning problem
    private async insert_blocks(blocks: ClipBlockInfo[], select?: SelectInfo) {
        if (blocks.length === 0) {
            return;
        }

        const cur_select_info =
            await this._editor.selectionManager.getSelectInfo();
        if (cur_select_info.blocks.length === 0) {
            return;
        }

        let beginIndex = 0;
        const curNodeId =
            cur_select_info.blocks[cur_select_info.blocks.length - 1].blockId;
        let curBlock = await this._editor.getBlockById(curNodeId);
        const blockView = this._editor.getView(curBlock.type);
        if (
            cur_select_info.type === 'Range' &&
            curBlock.type === 'text' &&
            blockView.isEmpty(curBlock)
        ) {
            await curBlock.setType(blocks[0].type);
            curBlock.setProperties(blocks[0].properties);
            await this._pasteChildren(curBlock, blocks[0].children);
            beginIndex = 1;
        } else if (
            select?.type === 'Range' &&
            cur_select_info.type === 'Range' &&
            this._canEditText(curBlock.type) &&
            this._canEditText(blocks[0].type)
        ) {
            if (
                cur_select_info.blocks.length > 0 &&
                cur_select_info.blocks[0].startInfo
            ) {
                const startInfo = cur_select_info.blocks[0].startInfo;
                const endInfo = cur_select_info.blocks[0].endInfo;
                const curTextValue = curBlock.getProperty('text').value;
                const pre_curTextValue = curTextValue.slice(
                    0,
                    startInfo.arrayIndex
                );
                const lastCurTextValue = curTextValue.slice(
                    endInfo.arrayIndex + 1
                );
                const preText = curTextValue[
                    startInfo.arrayIndex
                ].text.substring(0, startInfo.offset);
                const lastText = curTextValue[
                    endInfo.arrayIndex
                ].text.substring(endInfo.offset);

                let lastBlock: ClipBlockInfo = blocks[blocks.length - 1];
                if (!this._canEditText(lastBlock.type)) {
                    lastBlock = { type: 'text', children: [] };
                    blocks.push(lastBlock);
                }
                const lastValues = lastBlock.properties?.text?.value;
                lastText && lastValues.push({ text: lastText });
                lastValues.push(...lastCurTextValue);
                lastBlock.properties = {
                    text: { value: lastValues },
                };

                const insertInfo = blocks[0].properties.text;
                preText && pre_curTextValue.push({ text: preText });
                pre_curTextValue.push(...insertInfo.value);
                this._editor.blockHelper.setBlockBlur(curNodeId);
                setTimeout(async () => {
                    const curBlock = await this._editor.getBlockById(curNodeId);
                    curBlock.setProperties({
                        text: { value: pre_curTextValue },
                    });
                    await this._pasteChildren(curBlock, blocks[0].children);
                }, 0);
                beginIndex = 1;
            }
        }

        for (let i = beginIndex; i < blocks.length; i++) {
            const nextBlock = await this._editor.createBlock(blocks[i].type);
            nextBlock.setProperties(blocks[i].properties);
            if (curBlock.type === 'page') {
                curBlock.prepend(nextBlock);
            } else {
                curBlock.after(nextBlock);
            }

            await this._pasteChildren(nextBlock, blocks[i].children);
            curBlock = nextBlock;
        }
    }

    private async _pasteChildren(parent: AsyncBlock, children: any[]) {
        for (let i = 0; i < children.length; i++) {
            const nextBlock = await this._editor.createBlock(children[i].type);
            nextBlock.setProperties(children[i].properties);
            await parent.append(nextBlock);
            await this._pasteChildren(nextBlock, children[i].children);
        }
    }

    private _preCopyCut(action: ClipboardAction, e: ClipboardEvent) {
        switch (action) {
            case ClipboardAction.COPY:
                this._hooks.beforeCopy(e);
                break;

            case ClipboardAction.CUT:
                this._hooks.beforeCut(e);
                break;
        }
    }

    private _dispatchClipboardEvent(
        action: ClipboardAction,
        e: ClipboardEvent
    ) {
        this._preCopyCut(action, e);
    }

    dispose() {
        document.removeEventListener(ClipboardAction.COPY, this._handleCopy);
        document.removeEventListener(ClipboardAction.CUT, this._handleCut);
        document.removeEventListener(ClipboardAction.PASTE, this._handlePaste);
        this._eventTarget.removeEventListener(
            ClipboardAction.COPY,
            this._handleCopy
        );
        this._eventTarget.removeEventListener(
            ClipboardAction.CUT,
            this._handleCut
        );
        this._eventTarget.removeEventListener(
            ClipboardAction.PASTE,
            this._handlePaste
        );
        this._clipboardParse.dispose();
        this._clipboardParse = null;
        this._eventTarget = null;
        this._hooks = null;
        this._editor = null;
    }
}

export { BrowserClipboard };
