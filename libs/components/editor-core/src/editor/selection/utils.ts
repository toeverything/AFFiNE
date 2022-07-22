import { AsyncBlockList, PathList } from './types';
import { difference } from '@toeverything/utils';

interface TextSelection {
    anchor: { offset: number; path: Array<number> };
    focus: { offset: number; path: Array<number> };
}

interface SelectText {
    // discard blockId discard
    blockId?: string;
    renderId?: string;
    selection?: TextSelection;
    parentRenderId?: string;
}

export function isLikePathList(paths1: PathList, paths2: PathList) {
    if (paths1?.length !== paths2?.length) return false;
    return paths1.join() === paths2.join();
}

export function isLikeBlockList(a: AsyncBlockList, b: AsyncBlockList) {
    if (a?.length !== b?.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] != b[i]) return false;
    }
    return true;
}

export function isLikeBlockListIds(left: Array<string>, right: Array<string>) {
    if (left.length && right.length && left.length === right.length) {
        return !difference(left, right).length;
    }
    return false;
}

// export function isLikeSelectText(a: SelectText, b?: SelectText) {
//     if (a?.renderId === b?.renderId) {
//         if (a?.selection?.anchor.offset === b?.selection?.anchor.offset && a?.selection?.focus.offset === b?.selection?.focus.offset) return true;
//     }
//     return false;
// }
