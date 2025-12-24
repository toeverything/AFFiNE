import {
  ConnectorElementModel,
  MindmapElementModel,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
  NoteBlockModel,
} from '@blocksuite/affine-model';
import { Bound, clamp } from '@blocksuite/global/gfx';
import {
  type GfxGroupCompatibleInterface,
  type GfxModel,
  isGfxGroupCompatibleModel,
} from '@blocksuite/std/gfx';
import type { BlockModel, BlockProps } from '@blocksuite/store';

function updatChildElementsXYWH(
  container: GfxGroupCompatibleInterface,
  targetBound: Bound,
  updateElement: (id: string, props: Record<string, unknown>) => void,
  updateBlock: (
    model: BlockModel,
    callBackOrProps: (() => void) | Partial<BlockProps>
  ) => void
) {
  const containerBound = Bound.deserialize(container.xywh);
  const scaleX = targetBound.w / containerBound.w;
  const scaleY = targetBound.h / containerBound.h;
  container.childElements.forEach(child => {
    const childBound = Bound.deserialize(child.xywh);
    childBound.x = targetBound.x + scaleX * (childBound.x - containerBound.x);
    childBound.y = targetBound.y + scaleY * (childBound.y - containerBound.y);
    childBound.w = scaleX * childBound.w;
    childBound.h = scaleY * childBound.h;
    updateXYWH(child, childBound, updateElement, updateBlock);
  });
}

export function updateXYWH(
  ele: GfxModel,
  bound: Bound,
  updateElement: (id: string, props: Record<string, unknown>) => void,
  updateBlock: (
    model: BlockModel,
    callBackOrProps: (() => void) | Partial<BlockProps>
  ) => void
) {
  if (ele instanceof ConnectorElementModel) {
    ele.moveTo(bound);
  } else if (ele instanceof NoteBlockModel) {
    const scale = ele.props.edgeless.scale ?? 1;
    bound.w = clamp(bound.w, NOTE_MIN_WIDTH * scale, Infinity);
    bound.h = clamp(bound.h, NOTE_MIN_HEIGHT * scale, Infinity);
    if (bound.h >= NOTE_MIN_HEIGHT * scale) {
      updateBlock.call(ele.store, ele, () => {
        ele.props.edgeless.collapse = true;
        ele.props.edgeless.collapsedHeight = bound.h / scale;
      });
    }
    updateElement(ele.id, {
      xywh: bound.serialize(),
    });
  } else if (ele instanceof MindmapElementModel) {
    const rootId = ele.tree.id;
    const rootEle = ele.childElements.find(child => child.id === rootId);
    if (rootEle) {
      const rootBound = Bound.deserialize(rootEle.xywh);
      rootBound.x += bound.x - ele.x;
      rootBound.y += bound.y - ele.y;
      updateXYWH(rootEle, rootBound, updateElement, updateBlock);
    }
    ele.layout();
  } else if (isGfxGroupCompatibleModel(ele)) {
    updatChildElementsXYWH(ele, bound, updateElement, updateBlock);
    updateElement(ele.id, {
      xywh: bound.serialize(),
    });
  } else {
    updateElement(ele.id, {
      xywh: bound.serialize(),
    });
  }
}
