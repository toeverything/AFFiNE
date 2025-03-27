import type { Bound, IPoint } from '@blocksuite/global/gfx';

import type { GfxBlockComponent } from '../../view';
import type { GfxModel } from '../model/model';
import type { GfxElementModelView } from '../view/view';

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
   * If the current selection is a fallback selection, like selecting the element inside a group, the group will be selected instead
   */
  fallback: boolean;
};

export type GfxViewTransformInterface = {
  onDragStart: (context: DragStartContext) => void;
  onDragMove: (context: DragMoveContext) => void;
  onDragEnd: (context: DragEndContext) => void;
  onRotate: (context: {}) => void;
  onResize: (context: {}) => void;

  /**
   * When the element is selected by the pointer
   * @param context
   * @returns
   */
  onSelected: (context: SelectedContext) => void;
};
