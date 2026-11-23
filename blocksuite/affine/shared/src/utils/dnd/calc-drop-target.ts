import { DatabaseBlockModel, ListBlockModel } from '@blocksuite/affine-model';
import { type Point, Rect } from '@blocksuite/global/gfx';
import type { BlockComponent } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

import { BLOCK_CHILDREN_CONTAINER_PADDING_LEFT } from '../../consts/index.js';
import {
  getClosestBlockComponentByElement,
  getRectByBlockComponent,
} from '../dom/index.js';
import { matchModels } from '../model/index.js';
import { getDropRectByPoint } from './get-drop-rect-by-point.js';
import { DropFlags, type DropPlacement, type DropTarget } from './types.js';

function getVisiblePreviousElementSibling(element: Element | null) {
  if (!element) return null;
  let prev = element.previousElementSibling;
  // https://stackoverflow.com/questions/19669786/check-if-element-is-visible-in-dom
  while (prev instanceof HTMLElement && prev.offsetParent === null) {
    prev = prev.previousElementSibling;
  }
  return prev;
}

function getVisibleNextElementSibling(element: Element | null) {
  if (!element) return null;
  let next = element.nextElementSibling;
  while (next instanceof HTMLElement && next.offsetParent === null) {
    next = next.nextElementSibling;
  }
  return next;
}

/**
 * Calculates the drop target.
 */
export function calcDropTarget(
  point: Point,
  model: BlockModel,
  element: Element,
  draggingElements: BlockComponent[] = [],
  scale: number = 1,
  /**
   * Allow the dragging block to be dropped as sublist
   */
  allowSublist: boolean = true
): DropTarget | null {
  const schema = model.store.schema.get('affine:database');
  const children = schema?.model.children ?? [];

  let shouldAppendToDatabase = true;

  if (children.length && draggingElements.length) {
    shouldAppendToDatabase = draggingElements
      .map(el => el.model)
      .every(m => children.includes(m.flavour));
  }

  if (!shouldAppendToDatabase && !matchModels(model, [DatabaseBlockModel])) {
    const databaseBlockComponent =
      element.closest<BlockComponent>('affine-database');
    if (databaseBlockComponent) {
      element = databaseBlockComponent;
      model = databaseBlockComponent.model;
    }
  }

  let placement: DropPlacement = 'none';
  const height = 3 * scale;
  const dropResult = getDropRectByPoint(point, model, element);
  if (!dropResult) return null;
  const { rect: domRect, flag } = dropResult;

  if (flag === DropFlags.EmptyDatabase) {
    // empty database
    const rect = Rect.fromDOMRect(domRect);
    rect.top -= height / 2;
    rect.height = height;
    placement = 'database';

    return {
      placement,
      rect,
      modelState: {
        model,
        rect: domRect,
        element: element as BlockComponent,
      },
    };
  } else if (flag === DropFlags.Database) {
    // not empty database
    const distanceToTop = Math.abs(domRect.top - point.y);
    const distanceToBottom = Math.abs(domRect.bottom - point.y);
    const before = distanceToTop < distanceToBottom;
    placement = before ? 'before' : 'after';

    return {
      placement,
      rect: Rect.fromLWTH(
        domRect.left,
        domRect.width,
        (before ? domRect.top - 1 : domRect.bottom) - height / 2,
        height
      ),
      modelState: {
        model,
        rect: domRect,
        element: element as BlockComponent,
      },
    };
  }

  const distanceToTop = Math.abs(domRect.top - point.y);
  const distanceToBottom = Math.abs(domRect.bottom - point.y);
  const before = distanceToTop < distanceToBottom;

  placement = before ? 'before' : 'after';
  let offsetY = 4;

  if (placement === 'before') {
    // before
    let prev;
    let prevRect;

    prev = getVisiblePreviousElementSibling(element);
    if (prev) {
      if (
        draggingElements.length &&
        prev === draggingElements[draggingElements.length - 1]
      ) {
        placement = 'none';
      } else {
        prevRect = getRectByBlockComponent(prev);
      }
    } else {
      prev = getVisiblePreviousElementSibling(element.parentElement);
      if (prev) {
        prevRect = prev.getBoundingClientRect();
      }
    }

    if (prevRect) {
      offsetY = (domRect.top - prevRect.bottom) / 2;
    }
  } else {
    // Only consider drop as children when target block is list block.
    // To drop in, the position must after the target first
    // If drop in target has children, we can use insert before or after of that children
    // to achieve the same effect.
    const hasChild = (element as BlockComponent).childBlocks.length;
    if (
      allowSublist &&
      matchModels(model, [ListBlockModel]) &&
      !hasChild &&
      point.x > domRect.x + BLOCK_CHILDREN_CONTAINER_PADDING_LEFT
    ) {
      placement = 'in';
    }
    // after
    let next;
    let nextRect;

    next = getVisibleNextElementSibling(element);
    if (next) {
      if (
        placement === 'after' &&
        draggingElements.length &&
        next === draggingElements[0]
      ) {
        placement = 'none';
        next = null;
      }
    } else {
      next = getVisibleNextElementSibling(
        getClosestBlockComponentByElement(element.parentElement)
      );
    }

    if (next) {
      nextRect = getRectByBlockComponent(next);
      offsetY = (nextRect.top - domRect.bottom) / 2;
    }
  }

  if (placement === 'none') return null;

  let top = domRect.top;
  if (placement === 'before') {
    top -= offsetY;
  } else {
    top += domRect.height + offsetY;
  }

  if (placement === 'in') {
    domRect.x += BLOCK_CHILDREN_CONTAINER_PADDING_LEFT;
    domRect.width -= BLOCK_CHILDREN_CONTAINER_PADDING_LEFT;
  }

  return {
    placement,
    rect: Rect.fromLWTH(domRect.left, domRect.width, top - height / 2, height),
    modelState: {
      model,
      rect: domRect,
      element: element as BlockComponent,
    },
  };
}
