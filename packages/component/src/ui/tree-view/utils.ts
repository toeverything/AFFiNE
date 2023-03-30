import type { Node } from '@affine/component';

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
