import { Editor } from '../editor';
import { ClipboardUtils } from './clipboardUtils';

enum ClipboardAction {
    copy = 'copy',
    cut = 'cut',
    paste = 'paste',
}

//TODO: need to consider the cursor position after inserting the children
export class ClipboardEventDispatcher {
    private _editor: Editor;
    private _clipboardTarget: HTMLElement;
    private _utils: ClipboardUtils;

    constructor(editor: Editor, clipboardTarget: HTMLElement) {
        this._editor = editor;
        this._clipboardTarget = clipboardTarget;
        this._utils = new ClipboardUtils(editor);
        this._initialize();
    }

    private _initialize() {
        this._copyHandler = this._copyHandler.bind(this);
        this._cutHandler = this._cutHandler.bind(this);
        this._pasteHandler = this._pasteHandler.bind(this);

        document.addEventListener(ClipboardAction.copy, this._copyHandler);
        document.addEventListener(ClipboardAction.cut, this._cutHandler);
        document.addEventListener(ClipboardAction.paste, this._pasteHandler);
        this._clipboardTarget.addEventListener(
            ClipboardAction.copy,
            this._copyHandler
        );
        this._clipboardTarget.addEventListener(
            ClipboardAction.cut,
            this._cutHandler
        );
        this._clipboardTarget.addEventListener(
            ClipboardAction.paste,
            this._pasteHandler
        );
    }

    private _copyHandler(e: ClipboardEvent) {
        if (!this._utils.shouldHandlerContinue(e)) {
            return;
        }
        this._editor.getHooks().onCopy(e);
    }

    private _cutHandler(e: ClipboardEvent) {
        if (!this._utils.shouldHandlerContinue(e)) {
            return;
        }
        this._editor.getHooks().onCut(e);
    }
    private _pasteHandler(e: ClipboardEvent) {
        if (!this._utils.shouldHandlerContinue(e)) {
            return;
        }

        this._editor.getHooks().onPaste(e);
    }

    dispose() {
        document.removeEventListener(ClipboardAction.copy, this._copyHandler);
        document.removeEventListener(ClipboardAction.cut, this._cutHandler);
        document.removeEventListener(ClipboardAction.paste, this._pasteHandler);
        this._clipboardTarget.removeEventListener(
            ClipboardAction.copy,
            this._copyHandler
        );
        this._clipboardTarget.removeEventListener(
            ClipboardAction.cut,
            this._cutHandler
        );
        this._clipboardTarget.removeEventListener(
            ClipboardAction.paste,
            this._pasteHandler
        );
        this._editor = null;
    }
}
