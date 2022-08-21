import { ClipboardEventDispatcher } from './clipboardEventDispatcher';
import { HookType } from '@toeverything/components/editor-core';
import { Editor } from '../editor';
import { Copy } from './copy';
import { Paste } from './paste';
import ClipboardParse from './clipboard-parse';
import { MarkdownParser } from './markdown-parse';

export class Clipboard {
    private _clipboardEventDispatcher: ClipboardEventDispatcher;
    private _copy: Copy;
    private _paste: Paste;
    private _clipboardParse: ClipboardParse;
    private _markdownParse: MarkdownParser;

    constructor(editor: Editor, clipboardTarget: HTMLElement) {
        this._clipboardEventDispatcher = new ClipboardEventDispatcher(
            editor,
            clipboardTarget
        );
        this._clipboardParse = new ClipboardParse(editor);
        this._markdownParse = new MarkdownParser();
        this._copy = new Copy(editor);

        this._paste = new Paste(
            editor,
            this._clipboardParse,
            this._markdownParse
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
