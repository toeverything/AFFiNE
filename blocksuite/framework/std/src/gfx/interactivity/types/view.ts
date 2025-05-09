import type { Bound, IBound, IPoint } from '@blocksuite/global/gfx';

import type { GfxBlockComponent } from '../../../view/element/gfx-block-component.js';
import type { GfxModel } from '../../model/model.js';
import type { GfxElementModelView } from '../../view/view.js';

export type DragStartContext = {
  /**
   * The elements that are being dragged
   */
  elements: {
    view: GfxBlockComponent | GfxElementModelView;
    originalBound: Bound;
    model: GfxModel;
  }[];

  /**
   * The bound of element when drag starts
   */
  currentBound: Bound;
};

export type DragMoveContext = DragStartContext & {
  /**
   * The delta x of current drag position compared to the start position in model coordinate.
   */
  dx: number;

  /**
   * The delta y of current drag position compared to the start position in model coordinate.
   */
  dy: number;
};

export type DragEndContext = DragMoveContext;

export type SelectedContext = {
  /**
   * The selected state of the element
   */
  selected: boolean;

  /**
   * Whether is multi-select, usually triggered by shift key
   */
  multiSelect: boolean;

  /**
   * The pointer event that triggers the selection
   */
  event: PointerEvent;

  /**
   * The model position of the event pointer
   */
  position: IPoint;

  /**
   * If the current selection is a fallback selection.
   *
   * E.g., if selecting a child element inside a group, the `onSelected` method will be executed on group, and
   * the fallback is true because the it's not the original target(the child element).
   */
  fallback: boolean;
};

export type BoxSelectionContext = {
  box: Readonly<
    IBound & {
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }
  >;
};

export type GfxViewTransformInterface = {
  onDragStart: (context: DragStartContext) => void;
  onDragMove: (context: DragMoveContext) => void;
  onDragEnd: (context: DragEndContext) => void;
  onRotate: (context: {}) => void;
  onResize: (context: {}) => void;

  /**
   * When the element is selected by the pointer
   */
  onSelected: (context: SelectedContext) => void;

  /**
   * When the element is selected by box selection, return false to prevent the default selection behavior.
   */
  onBoxSelected: (context: BoxSelectionContext) => boolean | void;
};
