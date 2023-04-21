import type { Node } from './types';

export function flattenIds<RenderProps>(arr: Node<RenderProps>[]): string[] {
  const result: string[] = [];

  function flatten(arr: Node<RenderProps>[]) {
    for (let i = 0, len = arr.length; i < len; i++) {
      const item = arr[i];
      result.push(item.id);
      if (Array.isArray(item.children)) {
        flatten(item.children);
      }
    }
  }

  flatten(arr);
  return result;
}

export function findNode<RenderProps>(
  id: string,
  nodes: Node<RenderProps>[]
): Node<RenderProps> | undefined {
  for (let i = 0, len = nodes.length; i < len; i++) {
    const node = nodes[i];
    if (node.id === id) {
      return node;
    }
    if (node.children) {
      const result = findNode(id, node.children);
      if (result) {
        return result;
      }
    }
  }
}
