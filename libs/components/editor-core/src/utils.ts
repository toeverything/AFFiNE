import { Protocol } from '@toeverything/datasource/db-service';
import { AsyncBlock } from './editor';

// TODO is migrated to the implementation of block
export const supportedChildrenBlock = [
    Protocol.Block.Type.heading1,
    Protocol.Block.Type.heading2,
    Protocol.Block.Type.heading3,
    Protocol.Block.Type.text,
    Protocol.Block.Type.numbered,
    Protocol.Block.Type.bullet,
    Protocol.Block.Type.todo,
    Protocol.Block.Type.quote,
] as const;

/**
 * Is the block support render children.
 *
 * @example
 * ```ts
 * const supportChildren = isSupportChildren(block);
 * ```
 */
export const supportChildren = (block: AsyncBlock | unknown): boolean => {
    if (!(block instanceof AsyncBlock)) {
        return false;
    }
    return supportedChildrenBlock.some(type => type === block.type);
};
