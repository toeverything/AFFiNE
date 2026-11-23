import type { Store } from '@blocksuite/store';

import {
  type GfxCompatibleInterface,
  type GfxGroupCompatibleInterface,
  isGfxGroupCompatibleModel,
} from '../gfx/model/base.js';
import type { GfxGroupModel, GfxModel } from '../gfx/model/model.js';

type BatchGroupContainer = GfxGroupCompatibleInterface & {
  addChildren?: (elements: GfxModel[]) => void;
  removeChildren?: (elements: GfxModel[]) => void;
};

/**
 * Get the top elements from the list of elements, which are in some tree structures.
 *
 * For example: a list `[G1, E1, G2, E2, E3, E4, G4, E5, E6]`,
 * and they are in the elements tree like:
 * ```
 *     G1         G4      E6
 *    /  \        |
 *  E1   G2       E5
 *       / \
 *      E2  G3*
 *         / \
 *        E3 E4
 * ```
 * where the star symbol `*` denote it is not in the list.
 *
 * The result should be `[G1, G4, E6]`
 */
export function getTopElements(elements: GfxModel[]): GfxModel[] {
  const uniqueElements = [...new Set(elements)];
  const selected = new Set(uniqueElements);
  const topElements: GfxModel[] = [];

  for (const element of uniqueElements) {
    let ancestor = element.group;
    let hasSelectedAncestor = false;

    while (ancestor) {
      if (selected.has(ancestor as GfxModel)) {
        hasSelectedAncestor = true;
        break;
      }
      ancestor = ancestor.group;
    }

    if (!hasSelectedAncestor) {
      topElements.push(element);
    }
  }

  return topElements;
}

export function batchAddChildren(
  container: GfxGroupCompatibleInterface,
  elements: GfxModel[]
) {
  const uniqueElements = [...new Set(elements)];
  if (uniqueElements.length === 0) return;

  const batchContainer = container as BatchGroupContainer;
  if (batchContainer.addChildren) {
    batchContainer.addChildren(uniqueElements);
    return;
  }

  uniqueElements.forEach(element => {
    container.addChild(element);
  });
}

export function batchRemoveChildren(
  container: GfxGroupCompatibleInterface,
  elements: GfxModel[]
) {
  const uniqueElements = [...new Set(elements)];
  if (uniqueElements.length === 0) return;

  const batchContainer = container as BatchGroupContainer;
  if (batchContainer.removeChildren) {
    batchContainer.removeChildren(uniqueElements);
    return;
  }

  uniqueElements.forEach(element => {
    // oxlint-disable-next-line unicorn/prefer-dom-node-remove
    container.removeChild(element);
  });
}

function traverse(
  element: GfxModel,
  preCallback?: (element: GfxModel) => void | boolean,
  postCallBack?: (element: GfxModel) => void
) {
  // avoid infinite loop caused by circular reference
  const visited = new Set<GfxModel>();

  const innerTraverse = (element: GfxModel) => {
    if (visited.has(element)) return;
    visited.add(element);

    if (preCallback) {
      const interrupt = preCallback(element);
      if (interrupt) return;
    }

    if (isGfxGroupCompatibleModel(element)) {
      element.childElements.forEach(child => {
        innerTraverse(child);
      });
    }

    if (postCallBack) {
      postCallBack(element);
    }
  };

  innerTraverse(element);
}

export function descendantElementsImpl(
  container: GfxGroupCompatibleInterface
): GfxModel[] {
  const results: GfxModel[] = [];
  container.childElements.forEach(child => {
    traverse(child, element => {
      results.push(element);
    });
  });
  return results;
}

export function hasDescendantElementImpl(
  container: GfxGroupCompatibleInterface,
  element: GfxCompatibleInterface
): boolean {
  let _container = element.group;
  while (_container) {
    if (_container === container) return true;
    _container = _container.group;
  }
  return false;
}

/**
 * This checker is used to prevent circular reference, when adding a child element to a container.
 */
export function canSafeAddToContainer(
  container: GfxGroupModel,
  element: GfxCompatibleInterface
) {
  if (
    element === container ||
    (isGfxGroupCompatibleModel(element) && element.hasDescendant(container))
  ) {
    return false;
  }
  return true;
}

export function isLockedByAncestorImpl(
  element: GfxCompatibleInterface
): boolean {
  return element.groups.some(isLockedBySelfImpl);
}

export function isLockedBySelfImpl(element: GfxCompatibleInterface): boolean {
  return element.lockedBySelf ?? false;
}

export function isLockedImpl(element: GfxCompatibleInterface): boolean {
  return isLockedBySelfImpl(element) || isLockedByAncestorImpl(element);
}

export function lockElementImpl(doc: Store, element: GfxCompatibleInterface) {
  doc.transact(() => {
    element.lockedBySelf = true;
  });
}

export function unlockElementImpl(doc: Store, element: GfxCompatibleInterface) {
  doc.transact(() => {
    element.lockedBySelf = false;
  });
}
