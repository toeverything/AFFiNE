import { OverlayIdentifier } from '@blocksuite/affine-block-surface';
import { FrameBlockModel, MindmapElementModel } from '@blocksuite/affine-model';
import {
  type DragExtensionInitializeContext,
  getTopElements,
  GfxExtensionIdentifier,
  InteractivityExtension,
} from '@blocksuite/std/gfx';

import {
  type EdgelessFrameManager,
  type FrameOverlay,
  isFrameBlock,
} from './frame-manager';

export class FrameHighlightManager extends InteractivityExtension {
  static override key = 'frame-highlight-manager';

  get frameMgr() {
    return this.std.getOptional(
      GfxExtensionIdentifier('frame-manager')
    ) as EdgelessFrameManager;
  }

  get frameHighlightOverlay() {
    return this.std.getOptional(OverlayIdentifier('frame')) as FrameOverlay;
  }

  override mounted() {
    this.action.onDragInitialize((_: DragExtensionInitializeContext) => {
      if (!this.frameMgr || !this.frameHighlightOverlay) {
        return {};
      }

      let hoveredFrame: FrameBlockModel | null = null;
      const { frameMgr, frameHighlightOverlay } = this;
      let draggedFrames: FrameBlockModel[] = [];

      return {
        onDragStart(context) {
          draggedFrames = context.elements
            .map(elem => elem.model)
            .filter(model => isFrameBlock(model));
        },
        onDragMove(context) {
          const { dragLastPos } = context;

          hoveredFrame = frameMgr.getFrameFromPoint(
            [dragLastPos.x, dragLastPos.y],
            draggedFrames
          );

          if (hoveredFrame && !hoveredFrame.isLocked()) {
            frameHighlightOverlay.highlight(hoveredFrame);
          } else {
            frameHighlightOverlay.clear();
          }
        },
        onDragEnd(context) {
          const topElements = getTopElements(
            context.elements.map(elem =>
              elem.model.group instanceof MindmapElementModel
                ? elem.model.group
                : elem.model
            )
          );

          if (hoveredFrame) {
            frameMgr.addElementsToFrame(hoveredFrame, topElements);
          } else {
            topElements.forEach(elem => frameMgr.removeFromParentFrame(elem));
          }

          frameHighlightOverlay.clear();
        },
      };
    });

    this.event.on('pointermove', context => {
      const [x, y] = this.gfx.viewport.toModelCoord(
        context.event.x,
        context.event.y
      );
      const target = this.gfx.getElementByPoint(x, y);

      if (
        target instanceof FrameBlockModel &&
        target.externalBound?.isPointInBound([x, y])
      ) {
        this.frameHighlightOverlay.highlight(target);
      } else {
        this.frameHighlightOverlay.clear();
      }
    });
  }
}
