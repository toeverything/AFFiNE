import { BlockEditor } from '../..';

/**
 *
 * the global config for the editor
 * @class GridConfig
 */
export class GridConfig {
    private _maxGridItemCount = 6;
    private _editor: BlockEditor;

    constructor(editor: BlockEditor) {
        this._editor = editor;
    }

    get maxGridItemCount() {
        return this._maxGridItemCount;
    }

    set maxGridItemCount(value) {
        this._maxGridItemCount = value;
    }

    get gridItemMinWidth() {
        return 100 / this.maxGridItemCount;
    }
}
