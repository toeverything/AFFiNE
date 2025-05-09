import type { MindMapElement, MindMapJson, MindMapTreeNode } from './types';

function isMindMapElement(element: unknown): element is MindMapElement {
  return (
    typeof element === 'object' &&
    element !== null &&
    'type' in element &&
    (element as MindMapElement).type === 'mindmap' &&
    'children' in element &&
    typeof (element as MindMapElement).children === 'object' &&
    'json' in (element as MindMapElement).children
  );
}

function getMindMapChildrenJson(
  element: Record<string, unknown>
): MindMapJson | null {
  if (!isMindMapElement(element)) {
    return null;
  }

  return element.children.json;
}

export function getMindMapNodeMap(
  element: Record<string, unknown>
): Map<string, MindMapTreeNode> {
  const nodeMap = new Map<string, MindMapTreeNode>();
  const childrenJson = getMindMapChildrenJson(element);
  if (!childrenJson) {
    return nodeMap;
  }

  for (const [id, info] of Object.entries(childrenJson)) {
    nodeMap.set(id, {
      id,
      index: info.index,
      children: [],
    });
  }

  return nodeMap;
}

export function buildMindMapTree(element: Record<string, unknown>) {
  let root: MindMapTreeNode | null = null;

  // First traverse to get node map
  const nodeMap = getMindMapNodeMap(element);
  const childrenJson = getMindMapChildrenJson(element);
  if (!childrenJson) {
    return root;
  }

  // Second traverse to build tree
  for (const [id, info] of Object.entries(childrenJson)) {
    const node = nodeMap.get(id)!;

    if (info.parent) {
      const parentNode = nodeMap.get(info.parent);
      if (parentNode) {
        parentNode.children.push(node);
      }
    } else {
      root = node;
    }
  }

  return root;
}
