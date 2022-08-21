import { Editor } from '../editor';
import { SelectionManager } from '../selection';
import { HookType, PluginHooks } from '../types';
import ClipboardParse from './clipboard-parse';
import { Subscription } from 'rxjs';
import { Copy } from './copy';
class ClipboardPopulator {
    private _editor: Editor;
    private _hooks: PluginHooks;
    private _selectionManager: SelectionManager;
    private _clipboardParse: ClipboardParse;
    private _sub = new Subscription();
    private _copy: Copy;
    constructor(
        editor: Editor,
        hooks: PluginHooks,
        selectionManager: SelectionManager
    ) {
        this._editor = editor;
        this._hooks = hooks;
        this._selectionManager = selectionManager;
        this._clipboardParse = new ClipboardParse(editor);
        this._copy = new Copy(editor);
        this._sub.add(
            hooks.get(HookType.BEFORE_COPY).subscribe(this._copy.handleCopy)
        );
        this._sub.add(
            hooks.get(HookType.BEFORE_CUT).subscribe(this._copy.handleCopy)
        );
    }

    disposeInternal() {
        this._sub.unsubscribe();
        this._hooks = null;
    }
}

export { ClipboardPopulator };
