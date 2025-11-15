import type { Bound } from '@blocksuite/global/gfx';

import type { GfxBlockComponent } from '../../../view';
import type { GfxModel } from '../../model/model';
import type { GfxElementModelView } from '../../view/view';

export type DragInitializationOption = {
  movingElements: GfxModel[];
  event: PointerEvent | MouseEvent;
  onDragEnd?: () => void;
};

export type DragExtensionInitializeContext = {
  /**
   * The elements that are being dragged.
   * The extension can modify this array to add or remove dragging elements.
   */
  elements: GfxModel[];

  /**
   * Prevent the default drag behavior. The following drag events will not be triggered.
   */
  preventDefault: () => void;

  /**
   * The start position of the drag in model space.
   */
  dragStartPos: Readonly<{
    x: number;
    y: number;
  }>;
};

export type ExtensionBaseEvent = {
  /**
   * The elements that respond to the event.
   */
  elements: {
    view: GfxBlockComponent | GfxElementModelView;
    originalBound: Bound;
    model: GfxModel;
  }[];

  /**
   * The mouse event
   */
  event: PointerEvent;

  /**
   * The start position of the drag in model space.
   */
  dragStartPos: Readonly<{
    x: number;
    y: number;
  }>;

  /**
   * The last position of the drag in model space.
   */
  dragLastPos: Readonly<{
    x: number;
    y: number;
  }>;
};

export type ExtensionDragStartContext = ExtensionBaseEvent;

export type ExtensionDragMoveContext = ExtensionBaseEvent & {
  dx: number;
  dy: number;
};

export type ExtensionDragEndContext = ExtensionDragMoveContext;
