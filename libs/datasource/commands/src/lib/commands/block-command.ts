import { BlockFlavors } from '@toeverything/datasource/db-service';

/**
 *
 * commands for control blocks
 * @export
 * @class BlockCommands
 */
export class BlockCommands {
    private _workspace: string;
    constructor(workspace: string) {
        this._workspace = workspace;
    }
    /**
     *
     * create a block after typed id
     * @param {keyof BlockFlavors} type
     * @param {string} blockId
     * @return {*}
     * @memberof BlockCommands
     */
    public async createNextBlock(
        type: keyof BlockFlavors = 'text',
        blockId: string
    ) {
        // const block = await this._editor.getBlockById(blockId);
        // if (block) {
        //     const next_block = await this._editor.createBlock(type);
        //     await block.after(next_block);
        //     this._editor.selectionManager.activeNodeByNodeId(next_block.id);
        //     return next_block;
        // }
        // return undefined;
    }

    /**
     *
     * remove block by block id
     * @param {string} blockId
     * @memberof BlockCommands
     */
    public async removeBlock(blockId: string) {
        // const block = await this._editor.getBlockById(blockId);
        // if (block) {
        //     block.remove();
        // }
    }
}
