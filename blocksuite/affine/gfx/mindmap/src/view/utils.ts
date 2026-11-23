import { fitContent } from '@blocksuite/affine-gfx-shape';
import {
  applyNodeStyle,
  LayoutType,
  type MindmapElementModel,
  type MindmapNode,
  type MindmapRoot,
  type MindmapStyle,
  type NodeDetail,
  type NodeType,
  type ShapeElementModel,
} from '@blocksuite/affine-model';
import type { IVec } from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import {
  generateKeyBetween,
  type SurfaceBlockModel,
} from '@blocksuite/std/gfx';
import isEqual from 'lodash-es/isEqual';
import last from 'lodash-es/last';
import * as Y from 'yjs';

import { layout } from './layout.js';

export function getHoveredArea(
  target: ShapeElementModel,
  position: [number, number],
  layoutDir: LayoutType
): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
  const { x, y, w, h } = target;
  const center =
    layoutDir === LayoutType.BALANCE
      ? [x + w / 2, y + h / 2]
      : layoutDir === LayoutType.LEFT
        ? [x + (w / 3) * 1, y + h / 2]
        : [x + (w / 3) * 2, y + h / 2];

  return `${position[1] - center[1] > 0 ? 'bottom' : 'top'}-${position[0] - center[0] > 0 ? 'right' : 'left'}`;
}

/**
 * Hide the connector between the target node and its parent
 */
export function hideNodeConnector(
  mindmap: MindmapElementModel,
  /**
   * The mind map node which's connector will be hide
   */
  target: MindmapNode
) {
  const parent = mindmap.getParentNode(target.id);

  if (!parent) {
    return;
  }

  const connectorId = `#${parent.id}-${target.id}`;
  const connector = mindmap.connectors.get(connectorId);

  if (!connector) {
    return;
  }

  connector.opacity = 0;

  return () => {
    connector.opacity = 1;
  };
}

/**
 * Move the node to the new parent within the same mind map
 * @param mindmap
 * @param node the node should already exist in the mind map
 * @param parent
 * @param targetIndex
 * @param layout
 * @returns
 */
function moveNodePosition(
  mindmap: MindmapElementModel,
  node: MindmapNode,
  parent: string | MindmapNode,
  targetIndex: number,
  layout?: LayoutType
) {
  parent = mindmap.nodeMap.get(
    typeof parent === 'string' ? parent : parent.id
  )!;

  if (!parent || !mindmap.nodeMap.has(node.id)) {
    return;
  }

  assertType<MindmapNode>(parent);

  if (layout === LayoutType.BALANCE || parent !== mindmap.tree) {
    layout = undefined;
  }

  const siblings = parent.children.filter(child => child !== node);

  targetIndex = Math.min(targetIndex, parent.children.length);

  siblings.splice(targetIndex, 0, node);

  // calculate the index
  // the sibling node may be the same node, so we need to filter it out
  const preSibling = siblings[targetIndex - 1];
  const afterSibling = siblings[targetIndex + 1];
  const index =
    preSibling || afterSibling
      ? generateKeyBetween(
          preSibling?.detail.index ?? null,
          afterSibling?.detail.index ?? null
        )
      : (node.detail.index ?? undefined);

  mindmap.surface.store.transact(() => {
    const val: NodeDetail = {
      ...node.detail,
      index,
      parent: parent.id,
    };

    mindmap.children.set(node.id, val);
  });

  if (parent.detail.collapsed) {
    mindmap.toggleCollapse(parent);
  }

  mindmap.layout();

  return mindmap.nodeMap.get(node.id);
}

export function applyStyle(
  mindmap: MindmapElementModel,
  shouldFitContent: boolean = false
) {
  mindmap.surface.store.transact(() => {
    const style = mindmap.styleGetter;

    if (!style) return;

    applyNodeStyle(mindmap.tree, style.root);
    if (shouldFitContent) {
      fitContent(mindmap.tree.element as ShapeElementModel);
    }

    const walk = (node: MindmapNode, path: number[]) => {
      node.children.forEach((child, idx) => {
        const currentPath = [...path, idx];
        const nodeStyle = style.getNodeStyle(child, currentPath);

        applyNodeStyle(child, nodeStyle.node);
        if (shouldFitContent) {
          fitContent(child.element as ShapeElementModel);
        }

        walk(child, currentPath);
      });
    };

    walk(mindmap.tree, [0]);
  });
}

/**
 *
 * @param mindmap the mind map to add the node to
 * @param parent the parent node or the parent node id
 * @param node the node must be an detached node
 * @param targetIndex the index to insert the node at
 * @returns
 */
export function addNode(
  mindmap: MindmapElementModel,
  parent: string | MindmapNode,
  node: MindmapNode,
  targetIndex?: number
) {
  const parentNode = mindmap.getNode(
    typeof parent === 'string' ? parent : parent.id
  );

  if (!parentNode) {
    return;
  }

  const children = parentNode.children.slice();

  targetIndex =
    targetIndex !== undefined
      ? Math.min(targetIndex, children.length)
      : children.length;

  children.splice(targetIndex, 0, node);

  const before = children[targetIndex - 1] ?? null;
  const after = children[targetIndex + 1] ?? null;
  const index =
    before || after
      ? generateKeyBetween(
          before?.detail.index ?? null,
          after?.detail.index ?? null
        )
      : node.detail.index;

  mindmap.surface.store.transact(() => {
    mindmap.children.set(node.id, {
      ...node.detail,
      index,
      parent: parentNode.id,
    });

    const recursiveAddChild = (node: MindmapNode) => {
      node.children?.forEach(child => {
        mindmap.children.set(child.id, {
          ...child.detail,
          parent: node.id,
        });

        recursiveAddChild(child);
      });
    };

    recursiveAddChild(node);
  });

  if (parentNode.detail.collapsed) {
    mindmap.toggleCollapse(parentNode);
  }

  mindmap.layout();
}

export function addTree(
  mindmap: MindmapElementModel,
  parent: string | MindmapNode,
  tree: NodeType | MindmapNode,
  /**
   * `sibling` indicates where to insert a subtree among peer elements.
   * If it's a string, it represents a peer element's ID;
   * if it's a number, it represents its index.
   * The subtree will be inserted before the sibling element.
   */
  sibling?: string | number
) {
  parent = typeof parent === 'string' ? parent : parent.id;

  if (!mindmap.nodeMap.has(parent) || !parent) {
    return null;
  }

  assertType<string>(parent);

  const traverse = (
    node: NodeType | MindmapNode,
    parent: string,
    sibling?: string | number
  ) => {
    let nodeId: string;
    if ('text' in node) {
      nodeId = mindmap.addNode(parent, sibling, 'before', {
        text: node.text,
      });
    } else {
      mindmap.children.set(node.id, {
        ...node.detail,
        parent,
      });
      nodeId = node.id;
    }

    node.children?.forEach(child => traverse(child, nodeId));

    return nodeId;
  };

  if (!('text' in tree)) {
    // Modify the children ymap directly hence need transaction
    mindmap.surface.store.transact(() => {
      traverse(tree, parent, sibling);
    });

    applyStyle(mindmap);
    mindmap.layout();

    return mindmap.nodeMap.get(tree.id);
  } else {
    const nodeId = traverse(tree, parent, sibling);

    mindmap.layout();

    return mindmap.nodeMap.get(nodeId);
  }
}

/**
 * Detach a mindmap node or subtree. It is similar to `removeChild` but
 * it does not delete the node.
 *
 * So the node can be used to create a new mind map or merge into other mind map
 * @param mindmap the mind map that the subtree belongs to
 * @param subtree the subtree to detach
 */
export function detachMindmap(
  mindmap: MindmapElementModel,
  subtree: string | MindmapNode
) {
  subtree =
    typeof subtree === 'string' ? mindmap.nodeMap.get(subtree)! : subtree;

  assertType<MindmapNode>(subtree);

  if (!subtree) return;

  const traverse = (subtree: MindmapNode) => {
    mindmap.children.delete(subtree.id);

    // cut the reference inside the ymap
    subtree.detail = {
      ...subtree.detail,
    };

    subtree.children.forEach(child => traverse(child));
  };

  mindmap.surface.store.transact(() => {
    traverse(subtree);
  });

  mindmap.layout();

  delete subtree.detail.parent;

  return subtree;
}

export function handleLayout(
  mindmap: MindmapElementModel,
  tree?: MindmapNode | MindmapRoot,
  shouldApplyStyle = true,
  layoutType?: LayoutType
) {
  if (!tree || !tree.element) return;

  if (shouldApplyStyle) {
    applyStyle(mindmap, true);
  }

  mindmap.surface.store.transact(() => {
    const path = mindmap.getPath(tree.id);
    layout(tree, mindmap, layoutType ?? mindmap.getLayoutDir(tree.id), path);
  });
}

export function createFromTree(
  tree: MindmapNode,
  style: MindmapStyle,
  layoutType: LayoutType,
  surface: SurfaceBlockModel
) {
  const children = new Y.Map();
  const traverse = (subtree: MindmapNode, parent?: string) => {
    const value: NodeDetail = {
      ...subtree.detail,
      parent,
    };

    if (!parent) {
      delete value.parent;
    }

    children.set(subtree.id, value);

    subtree.children.forEach(child => traverse(child, subtree.id));
  };

  traverse(tree);

  const mindmapId = surface.addElement({
    type: 'mindmap',
    children,
    layoutType,
    style,
  });
  const mindmap = surface.getElementById(mindmapId) as MindmapElementModel;
  handleLayout(mindmap, mindmap.tree, true, mindmap.layoutType);

  return mindmap;
}

/**
 * Move a subtree from one mind map to another
 * @param from the mind map that the `subtree` belongs to
 * @param subtree the subtree to move
 * @param to the mind map to move the `subtree` to
 * @param parent the new parent node to attach the `subtree` to
 * @param index the index to insert the `subtree` at
 */
export function moveNode(
  from: MindmapElementModel,
  subtree: MindmapNode,
  to: MindmapElementModel,
  parent: MindmapNode | string,
  index: number
) {
  if (from === to) {
    return moveNodePosition(from, subtree, parent, index);
  }

  if (!detachMindmap(from, subtree)) return;

  return addNode(to, parent, subtree, index);
}

export function findTargetNode(
  mindmap: MindmapElementModel,
  position: IVec
): MindmapNode | null {
  const find = (node: MindmapNode): MindmapNode | null => {
    if (!node.responseArea) {
      return null;
    }

    const layoutDir = mindmap.getLayoutDir(node);

    if (
      layoutDir === LayoutType.BALANCE ||
      (layoutDir === LayoutType.RIGHT &&
        position[0] > node.element.x + node.element.w) ||
      (layoutDir === LayoutType.LEFT && position[0] < node.element.x)
    ) {
      for (const child of node.children) {
        const result = find(child);
        if (result) {
          return result;
        }
      }
    }

    return node.responseArea.containsPoint(position) ? node : null;
  };

  return find(mindmap.tree);
}

function determineInsertPosition(
  mindmap: MindmapElementModel,
  mindmapNode: MindmapNode,
  position: IVec
):
  | {
      type: 'child';
      layoutDir: LayoutType.LEFT | LayoutType.RIGHT;
    }
  | {
      type: 'sibling';
      layoutDir: LayoutType.LEFT | LayoutType.RIGHT;
      position: 'prev' | 'next';
    }
  | null {
  if (
    !mindmapNode.responseArea ||
    !mindmapNode.responseArea.containsPoint(position)
  ) {
    return null;
  }

  const layoutDir = mindmap.getLayoutDir(mindmapNode);
  const elementBound = mindmapNode.element.elementBound;
  const targetLayout: LayoutType.LEFT | LayoutType.RIGHT =
    layoutDir === LayoutType.BALANCE
      ? position[0] > elementBound.x + elementBound.w / 2
        ? LayoutType.RIGHT
        : LayoutType.LEFT
      : layoutDir;

  if (
    elementBound.containsPoint(position) ||
    (layoutDir === LayoutType.RIGHT
      ? position[0] > elementBound.x + elementBound.w
      : position[0] < elementBound.x)
  ) {
    return {
      type: 'child',
      layoutDir: targetLayout,
    };
  }

  if (
    mindmap.layoutType === LayoutType.BALANCE &&
    mindmap.getPath(mindmapNode.id).length === 2
  ) {
    return {
      type: 'sibling',
      layoutDir: targetLayout,
      position:
        targetLayout === LayoutType.LEFT
          ? position[1] > elementBound.y + elementBound.h / 2
            ? 'prev'
            : 'next'
          : position[1] > elementBound.y + elementBound.h / 2
            ? 'next'
            : 'prev',
    };
  }

  return {
    type: 'sibling',
    layoutDir: targetLayout,
    position:
      position[1] > elementBound.y + elementBound.h / 2 ? 'next' : 'prev',
  };
}

function showMergeIndicator(
  targetMindMap: MindmapElementModel,
  target: MindmapNode,
  sourceMindMap: MindmapElementModel,
  source: MindmapNode,
  insertPosition:
    | {
        type: 'sibling';
        layoutDir: Exclude<LayoutType, LayoutType.BALANCE>;
        position: 'prev' | 'next';
      }
    | { type: 'child'; layoutDir: Exclude<LayoutType, LayoutType.BALANCE> },
  callback: (option: {
    targetMindMap: MindmapElementModel;
    target: MindmapNode;
    sourceMindMap: MindmapElementModel;
    source: MindmapNode;
    newParent: MindmapNode;
    insertPosition:
      | {
          type: 'sibling';
          layoutDir: Exclude<LayoutType, LayoutType.BALANCE>;
          position: 'prev' | 'next';
        }
      | { type: 'child'; layoutDir: Exclude<LayoutType, LayoutType.BALANCE> };
    path: number[];
  }) => () => void
) {
  const newParent =
    insertPosition.type === 'child'
      ? target
      : targetMindMap.getParentNode(target.id)!;

  if (!newParent) {
    return null;
  }

  const path = targetMindMap.getPath(newParent);
  const curPath = sourceMindMap.getPath(source.id);

  if (insertPosition.type === 'sibling') {
    const curPath = targetMindMap.getPath(target.id);
    const parent = targetMindMap.getParentNode(target.id);

    if (!parent) {
      return null;
    }

    const idx = parent.children
      .filter(child => child.id !== source.id)
      .indexOf(target);

    path.push(
      idx === -1
        ? Math.max(
            0,
            last(curPath)! + (insertPosition.position === 'next' ? 1 : 0)
          )
        : Math.max(0, idx + (insertPosition.position === 'next' ? 1 : 0))
    );
  } else {
    path.push(target.children.length);
  }

  // hide original connector
  const abortPreview = callback({
    targetMindMap,
    target: target,
    sourceMindMap,
    source,
    newParent,
    insertPosition,
    path,
  });

  const abort = () => {
    abortPreview?.();
  };

  const merge = () => {
    abort();

    if (targetMindMap === sourceMindMap && isEqual(path, curPath)) {
      return;
    }

    moveNode(sourceMindMap, source, targetMindMap, newParent, last(path)!);
  };

  return {
    abort,
    merge,
  };
}

/**
 * Try to move a node to another mind map.
 * It will show a merge indicator if the node can be merged to the target mind map.
 * @param targetMindMap
 * @param target
 * @param sourceMindMap
 * @param source
 * @param position
 * @return return two functions, `abort` and `merge`. `abort` will cancel the operation and `merge` will merge the node to the target mind map.
 */
export function tryMoveNode(
  targetMindMap: MindmapElementModel,
  target: MindmapNode,
  sourceMindMap: MindmapElementModel,
  source: MindmapNode,
  position: IVec,
  callback: (option: {
    targetMindMap: MindmapElementModel;
    target: MindmapNode;
    sourceMindMap: MindmapElementModel;
    source: MindmapNode;
    newParent: MindmapNode;
    insertPosition:
      | {
          type: 'sibling';
          layoutDir: Exclude<LayoutType, LayoutType.BALANCE>;
          position: 'prev' | 'next';
        }
      | { type: 'child'; layoutDir: Exclude<LayoutType, LayoutType.BALANCE> };
    path: number[];
  }) => () => void
) {
  const insertInfo = determineInsertPosition(targetMindMap, target, position);

  if (!insertInfo) {
    return null;
  }

  return showMergeIndicator(
    targetMindMap,
    target,
    sourceMindMap,
    source,
    insertInfo,
    callback
  );
}

/**
 * Check if the mind map contains the target node.
 * @param mindmap Mind map to check
 * @param targetNode Node to check
 * @param searchParent If provided, check if the node is a descendant of the parent node. Otherwise, check the whole mind map.
 * @returns
 */
export function containsNode(
  mindmap: MindmapElementModel,
  targetNode: MindmapNode,
  searchParent?: MindmapNode
) {
  searchParent = searchParent ?? mindmap.tree;

  const find = (checkAgainstNode: MindmapNode) => {
    if (checkAgainstNode.id === targetNode.id) {
      return true;
    }

    for (const child of checkAgainstNode.children) {
      if (find(child)) {
        return true;
      }
    }

    return false;
  };

  return find(searchParent);
}
