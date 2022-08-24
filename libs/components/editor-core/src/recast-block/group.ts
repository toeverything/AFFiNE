import { Protocol } from '@toeverything/datasource/db-service';
import type { AsyncBlock, BlockEditor } from '../editor';
import { cloneRecastMetaTo, mergeRecastMeta } from './property';
import type { RecastBlock } from './types';

const mergeGroupProperties = async (...groups: RecastBlock[]) => {
    const [headGroup, ...restGroups] = groups;
    for (const group of restGroups) {
        await mergeRecastMeta(headGroup, group);
    }
};

const splitGroupProperties = async (...groups: RecastBlock[]) => {
    const [headGroup, ...restGroups] = groups;
    await cloneRecastMetaTo(headGroup, ...restGroups);
};

/**
 * Merge multiple groups into one group.
 */
export const mergeGroup = async (...groups: AsyncBlock[]) => {
    if (!groups.length) {
        return undefined;
    }
    const allIsGroup = groups.every(
        group => group.type === Protocol.Block.Type.group
    );
    if (!allIsGroup) {
        console.error(groups);
        throw new Error(
            'Failed to merge groups! Only the the group block can merged!'
        );
    }

    await mergeGroupProperties(...(groups as unknown as RecastBlock[]));

    const [headGroup, ...restGroups] = groups;
    // Add all children to the head group
    const children = (
        await Promise.all(restGroups.map(group => group.children()))
    ).flat();

    // Remove other group
    for (const group of restGroups) {
        await group.remove();
    }

    await headGroup.append(...children);
    return headGroup;
};

export const mergeToPreviousGroup = async (group: AsyncBlock) => {
    const previousGroup = await group.previousSibling();
    if (!previousGroup) {
        throw new Error(
            'Failed to merge previous group! previous block not found!'
        );
    }
    if (previousGroup.type !== Protocol.Block.Type.group) {
        console.error('previous block:', previousGroup);
        throw new Error(
            `Failed to merge previous group! previous block not group! type: ${previousGroup.type}`
        );
    }
    return await mergeGroup(previousGroup, group);
};

const findParentGroup = async (block: AsyncBlock) => {
    const group = await block.parent();
    if (!group) {
        throw new Error('Failed to split group! Parent group not found!');
    }
    if (group.type !== Protocol.Block.Type.group) {
        // TODO: find group recursively, need to handle splitIdx also
        console.error(
            `Expected type ${Protocol.Block.Type.group} but got type "${group.type}"`,
            'group:',
            group
        );
        throw new Error(
            'Failed to split group! Only the the group block can split!'
        );
    }
    return group;
};

const createGroupWithEmptyText = async (editor: BlockEditor) => {
    const groupBlock = await editor.createBlock('group');
    if (!groupBlock) {
        throw new Error('Create new group block fail!');
    }
    const textBlock = await editor.createBlock('text');
    if (!textBlock) {
        throw new Error('Create new text block fail!');
    }
    await groupBlock.append(textBlock);
    return groupBlock;
};

/**
 *
 * ```markdown
 * # Example
 *
 * - block1
 * - block2
 * - block3 <- Select block to split
 * - block4
 *
 * ↓
 *
 * - block1
 * - block2
 * ---      <- Create a new group
 * - block3 <- Remove it if `removeSplitPoint` is true
 * - block4
 *
 * ```
 */
export const splitGroup = async (
    editor: BlockEditor,
    splitPoint: AsyncBlock,
    removeSplitPoint = false
) => {
    const group = await findParentGroup(splitPoint);
    const groupChildrenIds = group.childrenIds;
    const splitIdx = group.findChildIndex(splitPoint.id);
    if (splitIdx === -1) {
        console.error('split block', splitPoint);
        throw new Error('Failed to split group! split point block not found!');
    }
    if (splitIdx === 0) {
        // Split from the first block
        const groupBlock = await createGroupWithEmptyText(editor);
        group.before(groupBlock);
        if (removeSplitPoint) {
            await splitPoint.remove();
        }
        return group;
    }

    const newGroupBlock = await editor.createBlock('group');
    if (!newGroupBlock) {
        throw new Error('Failed to split group! Create new group block fail!');
    }
    const newGroupChildId = groupChildrenIds.slice(splitIdx);
    const newGroupChild = (
        await Promise.all(newGroupChildId.map(id => editor.getBlockById(id)))
    ).filter(Boolean) as AsyncBlock[];

    // Remove from old group
    for (const block of newGroupChild) {
        await block.remove();
    }

    await newGroupBlock.append(...newGroupChild);
    if (removeSplitPoint) {
        await splitPoint.remove();
    }
    // If only one divider block add empty text block in group
    // TODO: use this simple logic after the block sync bug is fixed
    // if (!newGroupBlock.children.length) {
    if (
        !newGroupChild.length ||
        (newGroupChild.length === 1 && removeSplitPoint)
    ) {
        const textBlock = await editor.createBlock('text');
        if (!textBlock) {
            throw new Error(
                'Failed to split group! Create new text block fail!'
            );
        }
        await newGroupBlock.append(textBlock);
    }

    splitGroupProperties(
        group as unknown as RecastBlock,
        newGroupBlock as unknown as RecastBlock
    );
    await group.after(newGroupBlock);
    const newGroupFirstlyBlock = await newGroupBlock.children();
    setTimeout(() => {
        editor.selectionManager.activeNodeByNodeId(newGroupFirstlyBlock[0].id);
    }, 100);
    return newGroupBlock;
};

export const appendNewGroup = async (
    editor: BlockEditor,
    parentBlock: AsyncBlock,
    active = false
) => {
    const newGroupBlock = await createGroupWithEmptyText(editor);
    await parentBlock.append(newGroupBlock);
    if (active) {
        // Active text block
        await editor.selectionManager.activeNodeByNodeId(
            newGroupBlock.childrenIds[0]
        );
    }
    return newGroupBlock;
};

export const addNewGroup = async (
    editor: BlockEditor,
    previousBlock: AsyncBlock,
    active = false
) => {
    const newGroupBlock = await createGroupWithEmptyText(editor);
    await previousBlock.after(newGroupBlock);
    if (active) {
        // Active text block
        await editor.selectionManager.activeNodeByNodeId(
            newGroupBlock.childrenIds[0]
        );
    }
    return newGroupBlock;
};

export const unwrapGroup = async (group: AsyncBlock) => {
    const groupChild = await group.children();
    if (!groupChild.length) {
        await group.remove();
        return;
    }
    const prevBlock = await group.previousSibling();
    if (prevBlock) {
        prevBlock.after(...groupChild);
        await group.remove();
        return;
    }
    const parentBlock = await group.parent();
    if (parentBlock) {
        parentBlock.after(...groupChild);
        await group.remove();
        return;
    }

    throw new Error('Failed to unwrap group! Parent group not found!');
};
