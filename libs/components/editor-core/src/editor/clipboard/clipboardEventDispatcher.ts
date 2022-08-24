import { Editor } from '../editor';
import { ClipboardUtils } from './clipboardUtils';

enum ClipboardAction {
    copy = 'copy',
    cut = 'cut',
    paste = 'paste',
}

export class ClipboardEventDispatcher {
    private _editor: Editor;
    private _utils: ClipboardUtils;

    constructor(editor: Editor, clipboardTarget: HTMLElement) {
        this._editor = editor;
        this._utils = new ClipboardUtils(editor);

        this._copyHandler = this._copyHandler.bind(this);
        this._cutHandler = this._cutHandler.bind(this);
        this._pasteHandler = this._pasteHandler.bind(this);

        this.initialDocumentEvent();
        if (clipboardTarget) {
            this.initialClipboardTargetEvent(clipboardTarget);
        }
    }
    initialDocumentEvent() {
        this.disposeDocumentEvent();

        document.addEventListener(ClipboardAction.copy, this._copyHandler);
        document.addEventListener(ClipboardAction.cut, this._cutHandler);
        document.addEventListener(ClipboardAction.paste, this._pasteHandler);
    }
    initialClipboardTargetEvent(clipboardTarget: HTMLElement) {
        if (!clipboardTarget) {
            return;
        }

        this.disposeClipboardTargetEvent(clipboardTarget);

        clipboardTarget.addEventListener(
            ClipboardAction.copy,
            this._copyHandler
        );
        clipboardTarget.addEventListener(ClipboardAction.cut, this._cutHandler);
        clipboardTarget.addEventListener(
            ClipboardAction.paste,
            this._pasteHandler
        );
    }
    disposeDocumentEvent() {
        document.removeEventListener(ClipboardAction.copy, this._copyHandler);
        document.removeEventListener(ClipboardAction.cut, this._cutHandler);
        document.removeEventListener(ClipboardAction.paste, this._pasteHandler);
    }
    disposeClipboardTargetEvent(clipboardTarget: HTMLElement) {
        if (!clipboardTarget) {
            return;
        }

        clipboardTarget.removeEventListener(
            ClipboardAction.copy,
            this._copyHandler
        );
        clipboardTarget.removeEventListener(
            ClipboardAction.cut,
            this._cutHandler
        );
        clipboardTarget.removeEventListener(
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

    dispose(clipboardTarget: HTMLElement) {
        this.disposeDocumentEvent();
        this.disposeClipboardTargetEvent(clipboardTarget);
        this._editor = null;
    }
}
