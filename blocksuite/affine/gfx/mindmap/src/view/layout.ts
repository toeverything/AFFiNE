import {
  LayoutType,
  type MindmapElementModel,
  type MindmapNode,
  type MindmapRoot,
} from '@blocksuite/affine-model';
import type { SerializedXYWH } from '@blocksuite/global/gfx';
import { Bound } from '@blocksuite/global/gfx';

export const NODE_VERTICAL_SPACING = 45;
export const NODE_HORIZONTAL_SPACING = 110;
export const NODE_FIRST_LEVEL_HORIZONTAL_SPACING = 200;

type TreeSize = {
  /**
   * The parent of the tree
   */
  parent: TreeSize | null;

  /**
   * The root node of the tree
   */
  root: MindmapNode;

  /**
   * The size of the tree, including its descendants
   */
  bound: Bound;

  /**
   * The size of the children of the root
   */
  children: TreeSize[];
};

const calculateNodeSize = (
  root: MindmapNode,
  parent: TreeSize | null = null,
  rootChildren?: MindmapNode[]
): TreeSize => {
  const bound = root.element.elementBound;
  const children: TreeSize[] = [];
  const firstLevel = parent === null;

  rootChildren = rootChildren ?? root.children;

  const treeSize: TreeSize = {
    parent,
    root,
    bound,
    children,
  };

  if (rootChildren?.length && !root.detail.collapsed) {
    const childrenBound = rootChildren.reduce(
      (pre, node) => {
        const childSize = calculateNodeSize(node, treeSize);

        children.push(childSize);

        pre.w = Math.max(pre.w, childSize.bound.w);
        pre.h +=
          pre.h > 0
            ? NODE_VERTICAL_SPACING + childSize.bound.h
            : childSize.bound.h;

        return pre;
      },
      new Bound(0, 0, 0, 0)
    );

    bound.w +=
      childrenBound.w +
      (firstLevel
        ? NODE_FIRST_LEVEL_HORIZONTAL_SPACING
        : NODE_HORIZONTAL_SPACING);
    bound.h = Math.max(bound.h, childrenBound.h);
  }

  return treeSize;
};

const layoutTree = (
  tree: TreeSize,
  layoutType: LayoutType.LEFT | LayoutType.RIGHT,
  mindmap: MindmapElementModel,
  path: number[] = [0]
) => {
  const firstLevel = path.length === 1;
  const treeHeight = tree.bound.h;
  const currentX =
    layoutType === LayoutType.RIGHT
      ? tree.root.element.x +
        tree.root.element.w +
        (firstLevel
          ? NODE_FIRST_LEVEL_HORIZONTAL_SPACING
          : NODE_HORIZONTAL_SPACING)
      : tree.root.element.x -
        (firstLevel
          ? NODE_FIRST_LEVEL_HORIZONTAL_SPACING
          : NODE_HORIZONTAL_SPACING);
  let currentY = tree.root.element.y + (tree.root.element.h - treeHeight) / 2;

  if (tree.root.element.h >= treeHeight && tree.children.length) {
    const onlyChild = tree.children[0];

    currentY += (tree.root.element.h - onlyChild.root.element.h) / 2;
  }

  if (!tree.root.detail.collapsed) {
    tree.children.forEach((subtree, idx) => {
      const subtreeRootEl = subtree.root.element;
      const subtreeHeight = subtree.bound.h;
      const xywh = `[${
        layoutType === LayoutType.RIGHT ? currentX : currentX - subtreeRootEl.w
      },${currentY + (subtreeHeight - subtreeRootEl.h) / 2},${subtreeRootEl.w},${subtreeRootEl.h}]` as SerializedXYWH;

      const currentNodePath = [...path, idx];

      if (subtreeRootEl.xywh !== xywh) {
        subtreeRootEl.xywh = xywh;
      }

      layoutTree(subtree, layoutType, mindmap, currentNodePath);

      currentY += subtreeHeight + NODE_VERTICAL_SPACING;
    });
  }
};

const layoutRight = (
  root: MindmapNode,
  mindmap: MindmapElementModel,
  path = [0]
) => {
  const rootTree = calculateNodeSize(root, null);

  layoutTree(rootTree, LayoutType.RIGHT, mindmap, path);
};

const layoutLeft = (
  root: MindmapNode,
  mindmap: MindmapElementModel,
  path = [0]
) => {
  const rootTree = calculateNodeSize(root, null);

  layoutTree(rootTree, LayoutType.LEFT, mindmap, path);
};

const layoutBalance = (
  root: MindmapNode,
  mindmap: MindmapElementModel,
  path = [0]
) => {
  const rootTree = calculateNodeSize(root, null);
  const leftTree: MindmapNode[] = (root as MindmapRoot).left;
  const rightTree: MindmapNode[] = (root as MindmapRoot).right;

  {
    const leftTreeSize = calculateNodeSize(root, null, leftTree);
    const mockRoot = {
      parent: null,
      root: rootTree.root,
      bound: leftTreeSize.bound,
      children: leftTreeSize.children,
    };

    layoutTree(mockRoot, LayoutType.LEFT, mindmap, path);
  }

  {
    const rightTreeSize = calculateNodeSize(root, null, rightTree);
    const mockRoot = {
      parent: null,
      root: rootTree.root,
      bound: rightTreeSize.bound,
      children: rightTreeSize.children,
    };

    layoutTree(mockRoot, LayoutType.RIGHT, mindmap, [0]);
  }
};

export const layout = (
  root: MindmapNode,
  mindmap: MindmapElementModel,
  layoutDir: LayoutType | null,
  path: number[]
) => {
  layoutDir = layoutDir ?? mindmap.layoutType;

  switch (layoutDir) {
    case LayoutType.RIGHT:
      return layoutRight(root, mindmap, path);
    case LayoutType.LEFT:
      return layoutLeft(root, mindmap, path);
    case LayoutType.BALANCE:
      return layoutBalance(root, mindmap, path);
  }
};
