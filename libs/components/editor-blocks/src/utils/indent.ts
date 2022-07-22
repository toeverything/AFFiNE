import { supportChildren } from '@toeverything/components/editor-core';
import { Protocol } from '@toeverything/datasource/db-service';
import { AsyncBlock } from '@toeverything/framework/virgo';
import type { TodoAsyncBlock } from '../blocks/todo/types';

/**
 * Is the block in top level
 */
export const isTopLevelBlock = (parentBlock: AsyncBlock): boolean => {
    return (
        parentBlock.type === Protocol.Block.Type.group ||
        parentBlock.type === Protocol.Block.Type.page
    );
};

/**
 * @returns true if indent is success
 * @example
 * ```
 * [ ]
 *  └─ [ ]
 * [x]     <- tab
 *  └─ [ ]
 *
 * ↓
 *
 * [ ]
 *  ├─ [ ]
 *  ├─ [x] <-
 *  └─ [ ]
 * ```
 */
const indentBlock = async (block: TodoAsyncBlock) => {
    // Move down
    const previousBlock = await block.previousSibling();

    if (!previousBlock || !supportChildren(previousBlock)) {
        // Bottom, can not indent, do nothing
        return false;
    }

    // Indent current node, but preserve child node hierarchy
    const previousTodo = previousBlock as TodoAsyncBlock;
    await previousTodo.setProperties({
        collapsed: { value: false },
    });

    // 1. save target block children
    const children = await block.children();

    // 2. remove current block and children
    await block.remove();
    await block.removeChildren();
    // 3. append target block and children to previous node
    await previousTodo.append(block, ...children);
    return true;
};

/**
 * @returns true if dedent is success
 * @example
 * ```
 * [ ]
 *  ├─ [ ]
 *  ├─ [x] <- shift + tab
 *  └─ [ ]
 *
 * ↓
 *
 * [ ]
 *  └─ [ ]
 * [x]     <-
 *  └─ [ ]
 * ```
 */
const dedentBlock = async (block: AsyncBlock) => {
    // Move up
    let parentBlock = await block.parent();
    if (!parentBlock) {
        throw new Error('Failed to dedent block! Parent block not found!');
    }
    if (isTopLevelBlock(parentBlock)) {
        // Top, do nothing
        return false;
    }
    // 1. save child blocks of the parent block
    const previousSiblings = await block.previousSiblings();
    const nextSiblings = await block.nextSiblings();
    // const children = await parentBlock.children();
    // 2. remove all child blocks after the target block from the parent block
    await parentBlock.removeChildren();
    // TODO fix block sync with db-service
    // Need update block from service now
    parentBlock = await block.parent();
    if (!parentBlock) {
        throw new Error('Failed to dedent block! Parent block not found!');
    }
    await parentBlock.append(...previousSiblings);

    parentBlock = await block.parent();
    if (!parentBlock) {
        throw new Error('Failed to dedent block! Parent block not found!');
    }

    // 3. remove current block
    await block.remove();
    // 4. append parent children to target block
    await block.append(...nextSiblings);
    // 5. append block to parent
    await parentBlock.after(block);
    return true;
};

export const tabBlock = async (block: AsyncBlock, isShiftKey: boolean) => {
    if (isShiftKey) {
        return await dedentBlock(block);
    } else {
        return await indentBlock(block);
    }
};

const type2Map: Record<number, string> = {};
const type3Map: Record<number, string> = {};
export function getNumber(type: string, index: number) {
    if (type === 'type2') {
        if (type2Map[index]) {
            return type2Map[index];
        }
        type2Map[index] = getType2(index - 1);

        return type2Map[index];
    }
    if (type === 'type3') {
        if (type3Map[index]) {
            return type3Map[index];
        }
        type3Map[index] = getType3(index);

        return type3Map[index];
    }
    return index;
}

const getType2 = (n: number) => {
    const ordA = 'a'.charCodeAt(0);
    const ordZ = 'z'.charCodeAt(0);
    const len = ordZ - ordA + 1;
    let s = '';
    while (n >= 0) {
        s = String.fromCharCode((n % len) + ordA) + s;
        n = Math.floor(n / len) - 1;
    }
    return s;
};
const getType3 = (num: number) => {
    const lookup = {
        m: 1000,
        cm: 900,
        d: 500,
        cd: 400,
        c: 100,
        xc: 90,
        l: 50,
        xl: 40,
        x: 10,
        ix: 9,
        v: 5,
        iv: 4,
        i: 1,
    };
    let romanStr = '';
    for (const i in lookup) {
        while (num >= lookup[i as keyof typeof lookup]) {
            romanStr += i;
            num -= lookup[i as keyof typeof lookup];
        }
    }
    return romanStr;
};

export function getChildrenType(type: string) {
    const typeMap: Record<string, string> = {
        type1: 'type2',
        type2: 'type3',
        type3: 'type1',
    };
    return typeMap[type];
}
