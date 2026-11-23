import type { Store } from '@blocksuite/store';

import type { Layer } from '../gfx/layer.js';
import {
  type GfxGroupCompatibleInterface,
  isGfxGroupCompatibleModel,
} from '../gfx/model/base.js';
import { type GfxBlockElementModel } from '../gfx/model/gfx-block-model.js';
import type { GfxModel } from '../gfx/model/model.js';
import { GfxLocalElementModel } from '../gfx/model/surface/local-element-model.js';
import type { SurfaceBlockModel } from '../gfx/model/surface/surface-model.js';

export function getLayerEndZIndex(layers: Layer[], layerIndex: number) {
  const layer = layers[layerIndex];
  return layer ? layer.zIndex + layer.elements.length - 1 : 0;
}

export function updateLayersZIndex(layers: Layer[], startIdx: number) {
  const startLayer = layers[startIdx];
  let curIndex = startLayer.zIndex;

  for (let i = startIdx; i < layers.length; ++i) {
    const curLayer = layers[i];

    curLayer.zIndex = curIndex;
    curIndex += curLayer.elements.length;
  }
}

export function getElementIndex(indexable: GfxModel) {
  const groups = indexable.groups as GfxGroupCompatibleInterface[];

  if (groups.length) {
    const groupIndexes = groups
      .map(group => group.index)
      .reverse()
      .join('-');

    return `${groupIndexes}-${indexable.index}`;
  }

  return indexable.index;
}

export function ungroupIndex(index: string) {
  return index.split('-')[0];
}

export function insertToOrderedArray(array: GfxModel[], element: GfxModel) {
  let idx = 0;
  while (
    idx < array.length &&
    [SortOrder.BEFORE, SortOrder.SAME].includes(compare(array[idx], element))
  ) {
    ++idx;
  }

  array.splice(idx, 0, element);
}

export function removeFromOrderedArray(array: GfxModel[], element: GfxModel) {
  const idx = array.indexOf(element);

  if (idx !== -1) {
    array.splice(idx, 1);
  }
}

export enum SortOrder {
  AFTER = 1,
  BEFORE = -1,
  SAME = 0,
}

export function isInRange(edges: [GfxModel, GfxModel], target: GfxModel) {
  return compare(target, edges[0]) >= 0 && compare(target, edges[1]) < 0;
}

export function renderableInEdgeless(
  doc: Store,
  surface: SurfaceBlockModel,
  block: GfxBlockElementModel
) {
  const parent = doc.getParent(block);

  return parent === doc.root || parent === surface;
}

export function compareIndex(aIndex: string, bIndex: string) {
  return aIndex === bIndex
    ? SortOrder.SAME
    : aIndex < bIndex
      ? SortOrder.BEFORE
      : SortOrder.AFTER;
}

function compareLocal(
  a: GfxModel | GfxLocalElementModel,
  b: GfxModel | GfxLocalElementModel
) {
  const isALocal = a instanceof GfxLocalElementModel;
  const isBLocal = b instanceof GfxLocalElementModel;

  if (isALocal && a.creator && a.creator === b) {
    return SortOrder.AFTER;
  }

  if (isBLocal && b.creator && b.creator === a) {
    return SortOrder.BEFORE;
  }

  if (isALocal && isBLocal && a.creator && a.creator === b.creator) {
    return compareIndex(a.index, b.index);
  }

  return {
    a: isALocal && a.creator ? a.creator : a,
    b: isBLocal && b.creator ? b.creator : b,
  };
}

/**
 * A comparator function for sorting elements in the surface.
 * SortOrder.AFTER means a should be rendered after b and so on.
 * @returns
 */
export function compare(
  a: GfxModel | GfxLocalElementModel,
  b: GfxModel | GfxLocalElementModel
) {
  const result = compareLocal(a, b);

  if (typeof result === 'number') {
    return result;
  }

  a = result.a;
  b = result.b;

  if (isGfxGroupCompatibleModel(a) && b.groups.includes(a)) {
    return SortOrder.BEFORE;
  } else if (isGfxGroupCompatibleModel(b) && a.groups.includes(b)) {
    return SortOrder.AFTER;
  } else {
    const aGroups = a.groups as GfxGroupCompatibleInterface[];
    const bGroups = b.groups as GfxGroupCompatibleInterface[];

    let i = 1;
    let aGroup:
      | GfxModel
      | GfxGroupCompatibleInterface
      | GfxLocalElementModel
      | undefined = aGroups.at(-i);
    let bGroup:
      | GfxModel
      | GfxGroupCompatibleInterface
      | GfxLocalElementModel
      | undefined = bGroups.at(-i);

    while (aGroup === bGroup && aGroup) {
      ++i;
      aGroup = aGroups.at(-i);
      bGroup = bGroups.at(-i);
    }

    aGroup = aGroup ?? a;
    bGroup = bGroup ?? b;

    return compareIndex(aGroup.index, bGroup.index);
  }
}
