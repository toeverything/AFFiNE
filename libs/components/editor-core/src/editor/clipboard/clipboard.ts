import { ClipboardEventDispatcher } from './clipboardEventDispatcher';
import { HookType } from '@toeverything/components/editor-core';
import { Editor } from '../editor';
import { Copy } from './copy';
import { Paste } from './paste';

import { ClipboardUtils } from './clipboardUtils';

export class Clipboard {
    private _clipboardEventDispatcher: ClipboardEventDispatcher;
    private _copy: Copy;
    private _paste: Paste;
    private readonly _supportMarkdownPaste = true;
    public clipboardUtils: ClipboardUtils;

    constructor(editor: Editor, clipboardTarget: HTMLElement) {
        this.clipboardUtils = new ClipboardUtils(editor);
        this._copy = new Copy(editor);

        this._paste = new Paste(editor, this._supportMarkdownPaste);

        this._clipboardEventDispatcher = new ClipboardEventDispatcher(
            editor,
            clipboardTarget
        );

        editor
            .getHooks()
            .get(HookType.ON_COPY)
            .subscribe(this._copy.handleCopy);

        editor.getHooks().get(HookType.ON_CUT).subscribe(this._copy.handleCopy);

        editor
            .getHooks()
            .get(HookType.ON_PASTE)
            .subscribe(this._paste.handlePaste);
    }

    public dispose() {
        this._clipboardEventDispatcher.dispose();
    }
}
