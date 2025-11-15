import {
  LayoutType,
  type MindmapElementModel,
  type MindmapNode,
  type MindmapRoot,
} from '@blocksuite/affine-model';
import { Bound } from '@blocksuite/global/gfx';
import last from 'lodash-es/last';

import { NODE_HORIZONTAL_SPACING, NODE_VERTICAL_SPACING } from '../view/layout';

const isOnEdge = (node: MindmapNode, direction: 'tail' | 'head') => {
  let current = node;

  while (current) {
    if (!current.parent) return true;

    if (direction === 'tail' && last(current.parent.children) === current) {
      current = current.parent;
    } else if (direction === 'head' && current.parent.children[0] === current) {
      current = current.parent;
    } else {
      return false;
    }
  }

  return true;
};

const TAIL_RESPONSE_AREA = NODE_HORIZONTAL_SPACING;

const fillResponseArea = (
  node: MindmapNode,
  layoutType: LayoutType,
  parent: MindmapNode | null
) => {
  // root node
  if (!parent) {
    const rootElmBound = node.element.elementBound;
    const width =
      layoutType === LayoutType.BALANCE
        ? rootElmBound.w + TAIL_RESPONSE_AREA * 2
        : rootElmBound.w + TAIL_RESPONSE_AREA;

    node.responseArea = new Bound(
      layoutType === LayoutType.BALANCE || layoutType === LayoutType.LEFT
        ? rootElmBound.x - TAIL_RESPONSE_AREA
        : rootElmBound.x,
      rootElmBound.y,
      width,
      rootElmBound.h
    );

    if (node.detail.collapsed) {
      return;
    }

    if (layoutType === LayoutType.BALANCE) {
      (node as MindmapRoot).right.forEach(child => {
        fillResponseArea(child, LayoutType.RIGHT, node);
      });
      (node as MindmapRoot).left.forEach(child => {
        fillResponseArea(child, LayoutType.LEFT, node);
      });
    } else {
      node.children.forEach(child => {
        fillResponseArea(child, layoutType, node);
      });
    }
    return;
  } else {
    const nodeBound = node.element.elementBound;
    const idx = parent.children.indexOf(node) ?? -1;
    const isLast =
      idx === (parent.children.length || -1) - 1 && isOnEdge(node, 'tail');
    const isFirst = idx === 0 && isOnEdge(node, 'head');
    const upperSpacing = isFirst
      ? NODE_VERTICAL_SPACING * 2
      : NODE_VERTICAL_SPACING / 2;
    const lowerSpacing = isLast
      ? NODE_VERTICAL_SPACING * 2
      : NODE_VERTICAL_SPACING / 2;

    const h = nodeBound.h + upperSpacing + lowerSpacing;
    const w =
      (layoutType === LayoutType.RIGHT
        ? node.element.x +
          node.element.w -
          (parent.element.x + parent.element.w)
        : parent.element.x - node.element.x) + TAIL_RESPONSE_AREA;

    node.responseArea = new Bound(
      layoutType === LayoutType.RIGHT
        ? parent.element.x + parent.element.w
        : parent.element.x - w,
      node.element.y - upperSpacing,
      w,
      h
    );

    if (node.children.length > 0 && !node.detail.collapsed) {
      let responseArea: Bound;

      node.children.forEach(child => {
        fillResponseArea(child, layoutType, node);

        if (responseArea) {
          responseArea = responseArea.unite(child.responseArea!);
        } else {
          responseArea = child.responseArea!;
        }
      });

      node.responseArea.h = responseArea!.h;
      node.responseArea.y = responseArea!.y;
    }
  }
};

export const balanceLeftRightResponseArea = (tree: MindmapRoot) => {
  const leftTreeArea = tree.left.reduce((pre: Bound | null, node) => {
    if (pre) {
      return pre.unite(node.responseArea!);
    }
    return node.responseArea!;
  }, null);
  const rightTreeArea = tree.right.reduce((pre: Bound | null, node) => {
    if (pre) {
      return pre.unite(node.responseArea!);
    }
    return node.responseArea!;
  }, null);

  if (!leftTreeArea || !rightTreeArea) {
    return;
  }

  // if the height of the left tree and right tree are not equal
  // expand the response area of lower tree to match the height of the higher tree
  if (leftTreeArea.h !== rightTreeArea.h) {
    const isLeftHigher = leftTreeArea.h > rightTreeArea.h;
    const upperBoundary = isLeftHigher ? leftTreeArea.y : rightTreeArea.y;
    const bottomBoundary = isLeftHigher
      ? leftTreeArea.y + leftTreeArea.h
      : rightTreeArea.y + rightTreeArea.h;
    const targetChildren = isLeftHigher ? tree.right : tree.left;

    const expandEdge = (children: MindmapNode[]) => {
      const expand = (direction: 'up' | 'down') => {
        const expandUpperEdge = direction === 'up';
        const node = direction === 'up' ? children[0] : last(children)!;

        if (!node) return;

        if (node.responseArea) {
          node.responseArea.h = expandUpperEdge
            ? node.responseArea.h + (node.responseArea.y - upperBoundary)
            : node.responseArea.h +
              (bottomBoundary - node.responseArea.y - node.responseArea.h);
          expandUpperEdge && (node.responseArea.y = upperBoundary);
        }
      };

      expand('up');
      expand('down');
    };

    expandEdge(targetChildren);
  }
};

export const calculateResponseArea = (mindmap: MindmapElementModel) => {
  const layoutDir = mindmap.layoutType;
  const tree = mindmap.tree;

  switch (layoutDir) {
    case LayoutType.RIGHT:
    case LayoutType.LEFT:
      {
        fillResponseArea(tree, layoutDir, null);
      }
      break;
    case LayoutType.BALANCE:
      {
        fillResponseArea(tree, LayoutType.BALANCE, null);
        balanceLeftRightResponseArea(tree);
      }
      break;
  }
};
