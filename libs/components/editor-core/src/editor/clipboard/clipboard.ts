import { Editor } from '../editor';
import { HookType } from '../types';
import { ClipboardEventDispatcher } from './clipboardEventDispatcher';
import { Copy } from './copy';
import { Cut } from './cut';
import { Paste } from './paste';

import { ClipboardUtils } from './clipboardUtils';

export class Clipboard {
    private _clipboardEventDispatcher: ClipboardEventDispatcher;
    private _copy: Copy;
    private _cut: Cut;
    private _paste: Paste;
    public clipboardUtils: ClipboardUtils;
    private _clipboardTarget: HTMLElement;

    constructor(editor: Editor, clipboardTarget: HTMLElement) {
        this.clipboardUtils = new ClipboardUtils(editor);
        this._clipboardTarget = clipboardTarget;
        this._copy = new Copy(editor);
        this._cut = new Cut(editor);
        this._paste = new Paste(editor);

        this._clipboardEventDispatcher = new ClipboardEventDispatcher(
            editor,
            this._clipboardTarget
        );

        editor
            .getHooks()
            .get(HookType.ON_COPY)
            .subscribe(this._copy.handleCopy);

        editor.getHooks().get(HookType.ON_CUT).subscribe(this._cut.handleCut);

        editor
            .getHooks()
            .get(HookType.ON_PASTE)
            .subscribe(this._paste.handlePaste);
    }

    set clipboardTarget(clipboardTarget: HTMLElement) {
        this._clipboardTarget = clipboardTarget;
        this._clipboardEventDispatcher.initialClipboardTargetEvent(
            this._clipboardTarget
        );
    }
    get clipboardTarget() {
        return this._clipboardTarget;
    }

    public clipboardEvent2Blocks(e: ClipboardEvent) {
        return this._paste.clipboardEvent2Blocks(e);
    }

    public dispose() {
        this._clipboardEventDispatcher.dispose(this.clipboardTarget);
    }
}
