import type { Bound } from '@blocksuite/global/gfx';
import type { DisposableClass } from '@blocksuite/global/lit';
import type { BlockComponent } from '@blocksuite/std';
import type { TemplateResult } from 'lit';

export interface EdgelessDraggableElementHost extends DisposableClass {}

export interface OverlayLayer {
  /**
   * The root element of the overlay,
   * used to handle clip & prevent pointer events
   */
  mask: HTMLElement;
  /**
   * The real preview element
   */
  element: HTMLElement;
  /**
   * The wrapper that contains the preview element,
   * different from the element, this element has transition effect
   */
  transitionWrapper: HTMLElement;
}

export interface EdgelessDraggableElementOptions<T> {
  edgeless: BlockComponent;
  /**
   * In which element that the target should be dragged out
   * If not provided, recognized as the drag-out whenever dragging
   */
  scopeElement?: HTMLElement;
  /**
   * The width of the element when placed to canvas
   * @default 100
   */
  standardWidth?: number;

  /**
   * the threshold of mousedown and mouseup duration in ms
   * if the duration is less than this value, it will be treated as a click
   * @default 1500
   */
  clickThreshold?: number;

  /**
   * if enabled, when clicked, will trigger drag, press ESC or reclick to cancel
   */
  clickToDrag?: boolean;
  /**
   * the scale of the element inside {@link EdgelessDraggableElementController.scopeElement}
   * when {@link EdgelessDraggableElementOptions.clickToDrag} is enabled
   * @default 1.2
   */
  clickToDragScale?: number;

  /**
   * To verify if the move is valid
   */
  isValidMove?: (offset: { x: number; y: number }) => boolean;

  /**
   * when element is clicked - mouse down and up without moving
   */
  onElementClick?: (element: ElementInfo<T>) => void;
  /**
   *  when mouse down and moved, create overlay, customize overlay here
   */
  onOverlayCreated?: (overlay: OverlayLayer, element: ElementInfo<T>) => void;
  /**
   * trigger when enter/leave the scope element
   */
  onEnterOrLeaveScope?: (overlay: OverlayLayer, isOutside?: boolean) => void;
  /**
   * Drop the element on edgeless canvas
   */
  onDrop?: (element: ElementInfo<T>, bound: Bound) => void;

  /**
   * - ESC pressed
   * - or not dragged out and released
   */
  onCanceled?: (overlay: OverlayLayer, element: ElementInfo<T>) => void;
}

export type ElementInfo<T> = {
  // TODO: maybe make it optional, if not provided, clone event target
  preview: TemplateResult;
  data: T;
  /**
   * Override the value in {@link EdgelessDraggableElementOptions.standardWidth}
   */
  standardWidth?: number;
};

export const defaultIsValidMove = (offset: { x: number; y: number }) => {
  return Math.abs(offset.x) > 50 || Math.abs(offset.y) > 50;
};
