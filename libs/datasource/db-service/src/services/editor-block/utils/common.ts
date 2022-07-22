import { BlockImplInstance } from '@toeverything/datasource/jwt';

type Condition = (block: BlockImplInstance | undefined) => boolean;
/**
 * Find the block closest to the block up
 * @param block
 * @param condition conditional function, return true to indicate found
 * @returns
 */
export const getClosestBlock = (
    block: BlockImplInstance,
    condition: Condition
): BlockImplInstance | undefined => {
    let group: BlockImplInstance | undefined = block;
    while (!condition(group)) {
        group = group?.parent;
    }
    return group;
};

/**
 * Find the closest Page up
 * @param block
 * @returns
 */
export const getClosestPage = (
    block: BlockImplInstance
): BlockImplInstance | undefined => {
    return getClosestBlock(block, block => {
        return !block || block.flavor === 'page';
    });
};

/**
 * Find the closest group up
 * @param block
 * @returns
 */
export const getClosestGroup = (
    block: BlockImplInstance
): BlockImplInstance | undefined => {
    return getClosestBlock(block, block => {
        return !block || block.flavor === 'group';
    });
};

/**
 * Look up the group or page closest to the block
 * @param block
 * @returns
 */
export const getClosestGroupOrPage = (
    block: BlockImplInstance
): BlockImplInstance | undefined => {
    return getClosestBlock(block, block => {
        return !block || ['group', 'page'].includes(block?.flavor);
    });
};
