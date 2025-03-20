import { OverlayIdentifier } from '@blocksuite/affine-block-surface';
import { MindmapElementModel } from '@blocksuite/affine-model';
import {
  type DragExtensionInitializeContext,
  type ExtensionDragMoveContext,
  type GfxModel,
  TransformExtension,
} from '@blocksuite/block-std/gfx';
import type { Bound } from '@blocksuite/global/gfx';

import type { SnapOverlay } from '../utils/snap-manager';

export class SnapExtension extends TransformExtension {
  static override key = 'snap-manager';

  get snapOverlay() {
    return this.std.getOptional(
      OverlayIdentifier('snap-manager')
    ) as SnapOverlay;
  }

  override onDragInitialize(initContext: DragExtensionInitializeContext) {
    const snapOverlay = this.snapOverlay;

    if (!snapOverlay) {
      return {};
    }

    let alignBound: Bound;

    return {
      onDragStart() {
        alignBound = snapOverlay.setMovingElements(
          initContext.elements,
          initContext.elements.reduce((pre, elem) => {
            if (elem.group instanceof MindmapElementModel) {
              pre.push(elem.group);
            }

            return pre;
          }, [] as GfxModel[])
        );
      },
      onDragMove(context: ExtensionDragMoveContext) {
        if (
          context.elements.length === 0 ||
          alignBound.w === 0 ||
          alignBound.h === 0
        ) {
          return;
        }

        const currentBound = alignBound.moveDelta(context.dx, context.dy);
        const alignRst = snapOverlay.align(currentBound);

        context.dx = alignRst.dx + context.dx;
        context.dy = alignRst.dy + context.dy;
      },
      onDragEnd() {
        snapOverlay.clear();
      },
    };
  }
}
