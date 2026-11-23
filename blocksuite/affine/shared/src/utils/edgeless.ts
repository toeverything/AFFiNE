import { FrameBlockModel, GroupElementModel } from '@blocksuite/affine-model';
import {
  deserializeXYWH,
  getQuadBoundWithRotation,
} from '@blocksuite/global/gfx';
import type { GfxBlockElementModel, GfxModel } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

export function getSelectedRect(selected: GfxModel[]): DOMRect {
  if (selected.length === 0) {
    return new DOMRect();
  }

  const lockedElementsByFrame = selected.flatMap(selectable => {
    if (selectable instanceof FrameBlockModel && selectable.isLocked()) {
      return selectable.descendantElements;
    }
    return [];
  });

  selected = [...new Set([...selected, ...lockedElementsByFrame])];

  if (selected.length === 1) {
    const [x, y, w, h] = deserializeXYWH(selected[0].xywh);
    return new DOMRect(x, y, w, h);
  }

  return getElementsWithoutGroup(selected).reduce(
    (bounds, selectable, index) => {
      const rotate = isTopLevelBlock(selectable) ? 0 : selectable.rotate;
      const [x, y, w, h] = deserializeXYWH(selectable.xywh);
      let { left, top, right, bottom } = getQuadBoundWithRotation({
        x,
        y,
        w,
        h,
        rotate,
      });

      if (index !== 0) {
        left = Math.min(left, bounds.left);
        top = Math.min(top, bounds.top);
        right = Math.max(right, bounds.right);
        bottom = Math.max(bottom, bounds.bottom);
      }

      bounds.x = left;
      bounds.y = top;
      bounds.width = right - left;
      bounds.height = bottom - top;

      return bounds;
    },
    new DOMRect()
  );
}

export function getElementsWithoutGroup(elements: GfxModel[]) {
  const set = new Set<GfxModel>();

  elements.forEach(element => {
    if (element instanceof GroupElementModel) {
      element.descendantElements
        .filter(descendant => !(descendant instanceof GroupElementModel))
        .forEach(descendant => set.add(descendant));
    } else {
      set.add(element);
    }
  });
  return Array.from(set);
}

export function isTopLevelBlock(
  selectable: BlockModel | GfxModel | null
): selectable is GfxBlockElementModel {
  return !!selectable && 'flavour' in selectable;
}
