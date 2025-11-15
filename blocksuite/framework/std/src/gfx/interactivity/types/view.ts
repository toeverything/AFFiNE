import type { Bound, IBound, IPoint } from '@blocksuite/global/gfx';

import type { GfxBlockComponent } from '../../../view/element/gfx-block-component.js';
import type { GfxModel } from '../../model/model.js';
import type { GfxElementModelView } from '../../view/view.js';
import type { ResizeHandle } from '../resize/manager.js';

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

export type ResizeConstraint = {
  minWidth?: number;
  minHeight?: number;

  maxWidth?: number;
  maxHeight?: number;
  allowedHandlers?: ResizeHandle[];

  /**
   * Whether to lock the aspect ratio of the element when resizing.
   * If the value is an array, it will only lock the aspect ratio when resizing the specified handles.
   */
  lockRatio?: boolean | ResizeHandle[];
};

export type BeforeResizeContext = {
  /**
   * The elements that will be resized
   */
  elements: (GfxBlockComponent | GfxElementModelView)[];

  /**
   * Set the constraint before resize starts.
   */
  set: (constraint: ResizeConstraint) => void;
};

export type ResizeStartContext = {
  /**
   * The handle that is used to resize the element
   */
  handle: ResizeHandle;

  /**
   * The resize constraint.
   */
  constraint: Readonly<Required<ResizeConstraint>>;
};

export type ResizeMoveContext = ResizeStartContext & {
  /**
   * The element bound when resize starts
   */
  originalBound: Bound;

  newBound: Bound;

  /**
   * The matrix that used to transform the element.
   */
  matrix: DOMMatrix;

  lockRatio: boolean;
};

export type ResizeEndContext = ResizeStartContext;

export type RotateConstraint = {
  rotatable?: boolean;
};

export type BeforeRotateContext = {
  /**
   * The elements that will be rotated
   */
  elements: (GfxBlockComponent | GfxElementModelView)[];

  /**
   * Set the constraint before rotate starts.
   */
  set: (constraint: RotateConstraint) => void;
};

export type RotateStartContext = {
  constraint: Readonly<Required<RotateConstraint>>;
};

export type RotateMoveContext = RotateStartContext & {
  newBound: Bound;

  originalBound: Bound;

  newRotate: number;

  originalRotate: number;

  matrix: DOMMatrix;
};

export type RotateEndContext = RotateStartContext;

export type SelectableContext = {
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
};

export type SelectContext = SelectableContext & {
  /**
   * The selected state of the element
   */
  selected: boolean;
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

  /**
   * When the element is selected by box selection, return false to prevent the default selection behavior.
   */
  onBoxSelected: (context: BoxSelectionContext) => boolean | void;
};
