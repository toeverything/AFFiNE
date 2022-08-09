import { BlockEditor } from '../..';
import { GridConfig } from './grid';

// TODO: if config be complex, add children config abstract
/**
 *
 * the global config for the editor
 * @class EditorConfig
 */
export class EditorConfig {
    private _maxGridItemCount = 6;
    private _editor: BlockEditor;
    private _grid: GridConfig;

    constructor(editor: BlockEditor) {
        this._editor = editor;
        this._grid = new GridConfig(editor);
    }

    get grid() {
        return this._grid;
    }
}
