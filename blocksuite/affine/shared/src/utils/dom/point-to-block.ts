import { NoteBlockModel, RootBlockModel } from '@blocksuite/affine-model';
import { clamp, type Point, type Rect } from '@blocksuite/global/gfx';
import { BLOCK_ID_ATTR, type BlockComponent } from '@blocksuite/std';
import { SurfaceBlockModel } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

import { BLOCK_CHILDREN_CONTAINER_PADDING_LEFT } from '../../consts/index.js';
import { matchModels } from '../model/checker.js';

const ATTR_SELECTOR = `[${BLOCK_ID_ATTR}]`;

// margin-top: calc(var(--affine-paragraph-space) + 24px);
// h1.margin-top = 8px + 24px = 32px;
const MAX_SPACE = 32;
const STEPS = MAX_SPACE / 2 / 2;

/**
 * Returns `16` if node is contained in the parent.
 * Otherwise return `0`.
 */
function contains(parent: Element, node: Element) {
  return (
    parent.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_CONTAINED_BY
  );
}

/**
 * Returns `true` if element has `data-block-id` attribute.
 */
function hasBlockId(element: Element): element is BlockComponent {
  return element.hasAttribute(BLOCK_ID_ATTR);
}

/**
 * Returns `true` if element is default/edgeless page or note.
 */
function isRootOrNoteOrSurface(element: BlockComponent) {
  return matchModels(element.model, [
    RootBlockModel,
    NoteBlockModel,
    SurfaceBlockModel,
  ]);
}

function isBlock(element: BlockComponent) {
  return !isRootOrNoteOrSurface(element);
}

function isImage({ tagName }: Element) {
  return tagName === 'AFFINE-IMAGE';
}

function isDatabase({ tagName }: Element) {
  return tagName === 'AFFINE-DATABASE';
}

/**
 * Returns the closest block element by a point in the rect.
 *
 * ```
 * ############### block
 * ||############# block
 * ||||########### block
 * ||||    ...
 * ||||  y - 2 * n
 * ||||    ...
 * ||||----------- cursor
 * ||||    ...
 * ||||  y + 2 * n
 * ||||    ...
 * ||||########### block
 * ||############# block
 * ############### block
 * ```
 */
export function getClosestBlockComponentByPoint(
  point: Point,
  state: {
    rect?: Rect;
    container?: Element;
    snapToEdge?: {
      x: boolean;
      y: boolean;
    };
  } | null = null,
  scale = 1
): BlockComponent | null {
  const { y } = point;

  let container;
  let element = null;
  let bounds = null;
  let childBounds = null;
  let diff = 0;
  let n = 1;

  if (state) {
    const {
      snapToEdge = {
        x: true,
        y: false,
      },
    } = state;
    container = state.container;
    const rect = state.rect || container?.getBoundingClientRect();
    if (rect) {
      if (snapToEdge.x) {
        point.x = Math.min(
          Math.max(point.x, rect.left) +
            BLOCK_CHILDREN_CONTAINER_PADDING_LEFT * scale -
            1,
          rect.right - BLOCK_CHILDREN_CONTAINER_PADDING_LEFT * scale - 1
        );
      }
      if (snapToEdge.y) {
        // TODO handle scale
        if (scale !== 1) {
          console.warn('scale is not supported yet');
        }
        point.y = clamp(point.y, rect.top + 1, rect.bottom - 1);
      }
    }
  }

  // find block element
  element = findBlockComponent(
    document.elementsFromPoint(point.x, point.y),
    container
  );

  // Horizontal direction: for nested structures
  if (element) {
    // Database
    if (isDatabase(element)) {
      bounds = element.getBoundingClientRect();
      const rows = getDatabaseBlockRowsElement(element);
      if (rows) {
        childBounds = rows.getBoundingClientRect();

        if (childBounds.height) {
          if (point.y < childBounds.top || point.y > childBounds.bottom) {
            return element as BlockComponent;
          }
          childBounds = null;
        } else {
          return element as BlockComponent;
        }
      }
    } else {
      bounds = getRectByBlockComponent(element);
      // Indented paragraphs or list
      childBounds = element
        .querySelector('.affine-block-children-container')
        ?.firstElementChild?.getBoundingClientRect();

      if (childBounds && childBounds.height) {
        if (bounds.x < point.x && point.x <= childBounds.x) {
          return element as BlockComponent;
        }
        childBounds = null;
      } else {
        return element as BlockComponent;
      }
    }

    bounds = null;
    element = null;
  }

  // Vertical direction
  do {
    point.y = y - n * 2;

    if (n < 0) n--;
    n *= -1;

    // find block element
    element = findBlockComponent(
      document.elementsFromPoint(point.x, point.y),
      container
    );

    if (element) {
      bounds = getRectByBlockComponent(element);
      diff = bounds.bottom - point.y;
      if (diff >= 0 && diff <= STEPS * 2) {
        return element as BlockComponent;
      }
      diff = point.y - bounds.top;
      if (diff >= 0 && diff <= STEPS * 2) {
        return element as BlockComponent;
      }
      bounds = null;
      element = null;
    }
  } while (n <= STEPS);

  return element;
}

/**
 * Find the most close block on the given position
 * @param container container which the blocks can be found inside
 * @param point position
 * @param selector selector to find the block
 */
export function findClosestBlockComponent(
  container: BlockComponent,
  point: Point,
  selector: string
): BlockComponent | null {
  const children = (
    Array.from(container.querySelectorAll(selector)) as BlockComponent[]
  )
    .filter(child => child.host === container.host)
    .filter(child => child !== container);

  let lastDistance = Number.POSITIVE_INFINITY;
  let lastChild = null;

  if (!children.length) return null;

  for (const child of children) {
    const rect = child.getBoundingClientRect();
    if (rect.height === 0 || point.y > rect.bottom || point.y < rect.top)
      continue;
    const distance =
      Math.pow(point.y - (rect.y + rect.height / 2), 2) +
      Math.pow(point.x - rect.x, 2);

    if (distance <= lastDistance) {
      lastDistance = distance;
      lastChild = child;
    } else {
      return lastChild;
    }
  }

  return lastChild;
}

/**
 * Returns the closest block element by element that does not contain the page element and note element.
 */
export function getClosestBlockComponentByElement(
  element: Element | null
): BlockComponent | null {
  if (!element) return null;
  if (hasBlockId(element) && isBlock(element)) {
    return element;
  }
  const blockComponent = element.closest<BlockComponent>(ATTR_SELECTOR);
  if (blockComponent && isBlock(blockComponent)) {
    return blockComponent;
  }
  return null;
}

/**
 * Returns rect of the block element.
 *
 * Compatible with Safari!
 * https://github.com/toeverything/blocksuite/issues/902
 * https://github.com/toeverything/blocksuite/pull/1121
 */
export function getRectByBlockComponent(element: Element | BlockComponent) {
  if (!isDatabase(element)) element = element.firstElementChild ?? element;
  return element.getBoundingClientRect();
}

/**
 * Returns block elements excluding their subtrees.
 * Only keep block elements of same level.
 */
export function getBlockComponentsExcludeSubtrees(
  elements: BlockComponent[]
): BlockComponent[] {
  if (elements.length <= 1) return elements as BlockComponent[];

  const getLevel = (element: BlockComponent) => {
    let level = 0;
    let model: BlockModel | null = element.model;

    while (model && model.role !== 'root') {
      level++;
      model = model.parent;
    }

    return level;
  };

  let topMostLevel = Number.POSITIVE_INFINITY;
  const levels = elements.map(element => {
    const level = getLevel(element);

    topMostLevel = Math.min(topMostLevel, level);
    return level;
  });

  return elements.filter((_, index) => {
    return levels[index] === topMostLevel;
  }) as BlockComponent[];
}

/**
 * Find block element from an `Element[]`.
 * In Chrome/Safari, `document.elementsFromPoint` does not include `affine-image`.
 */
function findBlockComponent(elements: Element[], parent?: Element) {
  const len = elements.length;
  let element = null;
  let i = 0;
  while (i < len) {
    element = elements[i];
    i++;
    // if parent does not contain element, it's ignored
    if (parent && !contains(parent, element)) continue;
    if (hasBlockId(element) && isBlock(element)) return element;
    if (isImage(element)) {
      const element = elements[i];
      if (!element) return null;
      if (hasBlockId(element) && isBlock(element)) return element;
      return getClosestBlockComponentByElement(element);
    }
  }
  return null;
}

/**
 * Gets the rows of the database.
 */
function getDatabaseBlockRowsElement(element: Element) {
  return element.querySelector('.affine-database-block-rows');
}
