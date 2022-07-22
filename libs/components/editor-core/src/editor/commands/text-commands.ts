/**
 *
 * commands for control text and text styles
 * @export
 * @class TextCommand
 */
import { BlockEditor } from '../..';

export class TextCommands {
    private _editor: BlockEditor;

    constructor(editor: BlockEditor) {
        this._editor = editor;
    }

    /**
     *
     * get block text by block id
     * @param {string} blockId
     * @return {*}
     * @memberof TextCommand
     */
    public async getBlockText(blockId: string) {
        let string = '';
        const block = await this._editor.getBlockById(blockId);
        if (block) {
            string = block.getProperty('text')?.value[0]?.text || '';
        }
        return string;
    }

    /**
     *
     * set block text by block id
     * @param {string} blockId
     * @param {string} text
     * @memberof TextCommand
     */
    public async setBlockText(blockId: string, text: string) {
        const block = await this._editor.getBlockById(blockId);
        if (block) {
            await block.setProperty('text', { value: [{ text: text }] });
        }
    }

    public async getBlockRichText() {
        // TODO: need implement
    }
}
