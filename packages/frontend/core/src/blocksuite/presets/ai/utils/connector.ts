import {
  type ConnectorElementModel,
  type EdgelessRootService,
  SurfaceBlockComponent,
} from '@blocksuite/affine/blocks';
import { assertExists } from '@blocksuite/affine/global/utils';

export const getConnectorFromId = (
  id: string,
  surface: EdgelessRootService
) => {
  return surface.elements.filter(
    v => SurfaceBlockComponent.isConnector(v) && v.source.id === id
  ) as ConnectorElementModel[];
};
export const getConnectorToId = (id: string, surface: EdgelessRootService) => {
  return surface.elements.filter(
    v => SurfaceBlockComponent.isConnector(v) && v.target.id === id
  ) as ConnectorElementModel[];
};
export const getConnectorPath = (id: string, surface: EdgelessRootService) => {
  let current: string | undefined = id;
  const set = new Set<string>();
  const result: string[] = [];
  while (current) {
    if (set.has(current)) {
      return result;
    }
    set.add(current);
    const connector = getConnectorToId(current, surface);
    if (connector.length !== 1) {
      return result;
    }
    current = connector[0].source.id;
    if (current) {
      result.unshift(current);
    }
  }
  return result;
};
type ElementTree = {
  id: string;
  children: ElementTree[];
};
export const findTree = (
  rootId: string,
  surface: EdgelessRootService
): ElementTree => {
  const set = new Set<string>();
  const run = (id: string): ElementTree | undefined => {
    if (set.has(id)) {
      return;
    }
    set.add(id);
    const children = getConnectorFromId(id, surface);
    return {
      id,
      children: children.flatMap(model => {
        const childId = model.target.id;
        if (childId) {
          const elementTree = run(childId);
          if (elementTree) {
            return [elementTree];
          }
        }
        return [];
      }),
    };
  };
  const tree = run(rootId);
  assertExists(tree);
  return tree;
};
export const findLeaf = (
  tree: ElementTree,
  id: string
): ElementTree | undefined => {
  if (tree.id === id) {
    return tree;
  }
  for (const child of tree.children) {
    const result = findLeaf(child, id);
    if (result) {
      return result;
    }
  }
  return;
};
