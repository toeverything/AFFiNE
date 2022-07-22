import { BlockEditor } from '../..';
import { BlockCommands } from './block-commands';
import { TextCommands } from './text-commands';
export * from './types';

/**
 *
 * commands bind with editor , use for change model data
 * if want to get some block info use block helper
 * @export
 * @class EditorCommands
 * @deprecated to move into dbCommands
 */
export class EditorCommands {
    public blockCommands: BlockCommands;
    public textCommands: TextCommands;
    constructor(editor: BlockEditor) {
        this.blockCommands = new BlockCommands(editor);
        this.textCommands = new TextCommands(editor);
    }
}
