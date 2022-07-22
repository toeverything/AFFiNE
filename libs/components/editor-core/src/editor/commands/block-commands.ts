import { BlockFlavorKeys, Protocol } from '@toeverything/datasource/db-service';
import { sleep } from '@toeverything/utils';
import type { AsyncBlock } from '../../editor';
import { mergeGroup, splitGroup } from '../../recast-block';
import { Editor as BlockEditor } from '../editor';
import { GridDropType } from './types';

/**
 *
 * commands for control blocks
 * @export
 * @class BlockCommands
 */
export class BlockCommands {
    private _editor: BlockEditor;

    constructor(editor: BlockEditor) {
        this._editor = editor;
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
        blockId: string,
        type: BlockFlavorKeys = Protocol.Block.Type.text
    ) {
        const block = await this._editor.getBlockById(blockId);
        if (block) {
            const next_block = await this._editor.createBlock(type);
            if (next_block) {
                await block.after(next_block);
                this._editor.selectionManager.activeNodeByNodeId(next_block.id);
                return next_block;
            }
        }
        return undefined;
    }

    /**
     *
     * remove block by block id
     * @param {string} blockId
     * @memberof BlockCommands
     */
    public async removeBlock(blockId: string) {
        const block = await this._editor.getBlockById(blockId);
        if (block) {
            block.remove();
        }
    }

    /**
     *
     * convert blocks to other type
     * @param {BlockFlavorKeys} type
     * @memberof BlockCommands
     */
    public async convertBlock(blockId: string, type: BlockFlavorKeys) {
        const block = await this._editor.getBlockById(blockId);
        if (block) {
            await block.setType(type);
            await sleep(10);
            this._editor.selectionManager.activeNodeByNodeId(block.id);
        }
        return block;
    }

    /**
     *
     * move block to another block`s after
     * @param {string} from
     * @param {string} to
     * @memberof BlockCommands
     */
    public async moveBlockAfter(from: string, to: string) {
        const fromBlock = await this._editor.getBlockById(from);
        const toBlock = await this._editor.getBlockById(to);
        if (fromBlock && toBlock) {
            await fromBlock.remove();
            await toBlock.after(fromBlock);
        }
    }

    /**
     *
     * move block to another block`s after
     * @param {string} from
     * @param {string} to
     * @memberof BlockCommands
     */
    public async moveBlockBefore(from: string, to: string) {
        const fromBlock = await this._editor.getBlockById(from);
        const toBlock = await this._editor.getBlockById(to);
        if (fromBlock && toBlock) {
            await fromBlock.remove();
            await toBlock.before(fromBlock);
        }
    }

    /**
     *
     * add a new layout block
     * @param {string} dragBlockId
     * @param {string} dropBlockId
     * @param {*} [type=GridDropType.left]
     * @memberof BlockCommands
     */
    public async createLayoutBlock(
        dragBlockId: string,
        dropBlockId: string,
        type = GridDropType.left
    ) {
        const layoutBlock = await this._editor.createBlock(
            Protocol.Block.Type.grid
        );
        const dragBlock = await this._editor.getBlockById(dragBlockId);
        const dropBlock = await this._editor.getBlockById(dropBlockId);
        const leftGridItemBlock = await this._editor.createBlock(
            Protocol.Block.Type.gridItem
        );
        const rightGridItemBlock = await this._editor.createBlock(
            Protocol.Block.Type.gridItem
        );
        let leftBlock, rightBlock;
        if (type === GridDropType.left) {
            leftBlock = dragBlock;
            rightBlock = dropBlock;
        } else {
            leftBlock = dropBlock;
            rightBlock = dragBlock;
        }
        await dropBlock.after(layoutBlock);
        await leftBlock.remove();
        await rightBlock.remove();
        await leftGridItemBlock.append(leftBlock);
        await rightGridItemBlock.append(rightBlock);
        await layoutBlock.append(leftGridItemBlock, rightGridItemBlock);
        return layoutBlock;
    }

    public async createGridItem(blockId: string) {
        const gridItemBlock = await this.createNextBlock(
            blockId,
            Protocol.Block.Type.gridItem
        );
        if (gridItemBlock) {
            const textBlock = await this._editor.createBlock(
                Protocol.Block.Type.text
            );
            gridItemBlock.append(textBlock);
            return [gridItemBlock, textBlock];
        }
        return [];
    }

    public async splitGroupFromBlock(blockId: string) {
        const block = await this._editor.getBlockById(blockId);
        await splitGroup(this._editor, block);
        return;
    }

    public async mergeGroup(...blocks: AsyncBlock[]) {
        await mergeGroup(...blocks);
        return;
    }
}
