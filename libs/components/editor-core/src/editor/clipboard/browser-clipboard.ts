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
import { shouldHandlerContinue } from './utils';
import { Paste } from './paste';
// todo needs to be a switch

enum ClipboardAction {
    COPY = 'copy',
    CUT = 'cut',
    PASTE = 'paste',
}

//TODO: need to consider the cursor position after inserting the children
class BrowserClipboard {
    private _eventTarget: Element;
    private _hooks: HooksRunner;
    private _editor: Editor;
    private _clipboardParse: ClipboardParse;
    private _markdownParse: MarkdownParser;
    private _paste: Paste;

    constructor(eventTarget: Element, hooks: HooksRunner, editor: Editor) {
        this._eventTarget = eventTarget;
        this._hooks = hooks;
        this._editor = editor;
        this._clipboardParse = new ClipboardParse(editor);
        this._markdownParse = new MarkdownParser();
        this._paste = new Paste(
            editor,
            this._clipboardParse,
            this._markdownParse
        );
        this._initialize();
    }

    public getClipboardParse() {
        return this._clipboardParse;
    }

    private _initialize() {
        this._handleCopy = this._handleCopy.bind(this);
        this._handleCut = this._handleCut.bind(this);

        document.addEventListener(ClipboardAction.COPY, this._handleCopy);
        document.addEventListener(ClipboardAction.CUT, this._handleCut);
        document.addEventListener(
            ClipboardAction.PASTE,
            this._paste.handlePaste
        );
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
            this._paste.handlePaste
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
        document.removeEventListener(
            ClipboardAction.PASTE,
            this._paste.handlePaste
        );
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
            this._paste.handlePaste
        );
        this._clipboardParse.dispose();
        this._clipboardParse = null;
        this._eventTarget = null;
        this._hooks = null;
        this._editor = null;
    }
}

export { BrowserClipboard };
