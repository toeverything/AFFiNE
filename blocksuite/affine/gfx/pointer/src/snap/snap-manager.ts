import { OverlayIdentifier } from '@blocksuite/affine-block-surface';
import { MindmapElementModel } from '@blocksuite/affine-model';
import { type Bound } from '@blocksuite/global/gfx';
import {
  type DragExtensionInitializeContext,
  type ExtensionDragMoveContext,
  type GfxModel,
  InteractivityExtension,
} from '@blocksuite/std/gfx';

import type { SnapOverlay } from './snap-overlay';

export class SnapExtension extends InteractivityExtension {
  static override key = 'snap-manager';

  get snapOverlay() {
    return this.std.getOptional(
      OverlayIdentifier('snap-manager')
    ) as SnapOverlay;
  }

  override mounted(): void {
    this.action.onDragInitialize(
      (initContext: DragExtensionInitializeContext) => {
        const snapOverlay = this.snapOverlay;

        if (!snapOverlay) {
          return {};
        }

        let alignBound: Bound | null = null;

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
              !alignBound ||
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
          clear() {
            alignBound = null;
            snapOverlay.clear();
          },
        };
      }
    );

    this.action.onElementResize(() => {
      const snapOverlay = this.snapOverlay;

      if (!snapOverlay) {
        return {};
      }

      return {
        onResizeStart(context) {
          snapOverlay.setMovingElements(context.elements);
        },
        onResizeMove(context) {
          const {
            handle,
            originalBound,
            scaleX,
            scaleY,
            handleSign,
            currentHandlePos,
            elements,
          } = context;
          const rotate = elements.length > 1 ? 0 : elements[0].rotate;
          const alignDirection: ('vertical' | 'horizontal')[] = [];
          let switchDirection = false;
          let nx = handleSign.x;
          let ny = handleSign.y;

          if (handle.length > 6) {
            alignDirection.push('vertical', 'horizontal');
          } else if (rotate % 90 === 0) {
            nx =
              handleSign.x * Math.cos((rotate / 180) * Math.PI) -
              handleSign.y * Math.sin((rotate / 180) * Math.PI);
            ny =
              handleSign.x * Math.sin((rotate / 180) * Math.PI) +
              handleSign.y * Math.cos((rotate / 180) * Math.PI);

            if (Math.abs(nx) > Math.abs(ny)) {
              alignDirection.push('horizontal');
            } else {
              alignDirection.push('vertical');
            }

            if (rotate % 180 !== 0) {
              switchDirection = true;
            }
          }

          if (alignDirection.length > 0) {
            const rst = snapOverlay.alignResize(
              currentHandlePos,
              alignDirection
            );

            const dx = switchDirection ? ny * rst.dy : nx * rst.dx;
            const dy = switchDirection ? nx * rst.dx : ny * rst.dy;

            context.suggest({
              scaleX: scaleX + dx / originalBound.w,
              scaleY: scaleY + dy / originalBound.h,
            });
          }
        },
        onResizeEnd() {
          snapOverlay.clear();
        },
      };
    });
  }
}
