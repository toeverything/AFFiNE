import { OverlayIdentifier } from '@blocksuite/affine-block-surface';
import {
  type FrameBlockModel,
  MindmapElementModel,
} from '@blocksuite/affine-model';
import {
  type DragExtensionInitializeContext,
  type ExtensionDragEndContext,
  type ExtensionDragMoveContext,
  type ExtensionDragStartContext,
  getTopElements,
  GfxExtensionIdentifier,
  TransformExtension,
} from '@blocksuite/block-std/gfx';

import {
  type EdgelessFrameManager,
  type FrameOverlay,
  isFrameBlock,
} from './frame-manager';

export class FrameHighlightManager extends TransformExtension {
  static override key = 'frame-highlight-manager';

  get frameMgr() {
    return this.std.getOptional(
      GfxExtensionIdentifier('frame-manager')
    ) as EdgelessFrameManager;
  }

  get frameHighlightOverlay() {
    return this.std.getOptional(OverlayIdentifier('frame')) as FrameOverlay;
  }

  override onDragInitialize(_: DragExtensionInitializeContext): {
    onDragStart?: (context: ExtensionDragStartContext) => void;
    onDragMove?: (context: ExtensionDragMoveContext) => void;
    onDragEnd?: (context: ExtensionDragEndContext) => void;
    clear?: () => void;
  } {
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
  }
}
