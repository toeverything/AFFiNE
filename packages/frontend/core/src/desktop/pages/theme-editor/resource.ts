import { darkCssVariables, lightCssVariables } from '@toeverything/theme';
import {
  darkCssVariablesV2,
  lightCssVariablesV2,
} from '@toeverything/theme/v2';

import { partsToVariableName, variableNameToParts } from './utils';

export type Variable = {
  id: string;
  name: string;
  variableName: string;
  light: string;
  dark: string;
  ancestors: string[];
};

export interface TreeNode {
  id: string;
  label: string;
  parentId?: string;
  children?: TreeNode[];
  variables?: Variable[];
}
export interface ThemeInfo {
  tree: TreeNode[];
  nodeMap: Map<string, TreeNode>;
  variableMap: Map<string, Variable>;
}

const sortTree = (tree: TreeNode[]) => {
  const compare = (a: TreeNode, b: TreeNode) => {
    if (a.children && !b.children) return -1;
    if (!a.children && b.children) return 1;
    return a.label.localeCompare(b.label);
  };
  const walk = (node: TreeNode) => {
    node.children?.sort(compare);
    node.children?.forEach(walk);
  };

  tree.sort(compare).forEach(walk);
  return tree;
};

const getTree = (
  light: Record<string, string>,
  dark: Record<string, string>
): ThemeInfo => {
  const lightKeys = Object.keys(light);
  const darkKeys = Object.keys(dark);
  const allKeys = Array.from(new Set([...lightKeys, ...darkKeys])).map(name =>
    variableNameToParts(name)
  );
  const rootNodesSet = new Set<TreeNode>();
  const nodeMap = new Map<string, TreeNode>();
  const variableMap = new Map<string, Variable>();

  allKeys.forEach(parts => {
    let id = '';
    let node: TreeNode | undefined;
    const ancestors: string[] = [];

    parts.slice(0, -1).forEach((part, index) => {
      const isLeaf = index === parts.length - 2;
      const parentId = id ? id : undefined;
      id += `/${part}`;
      ancestors.push(id);
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          parentId,
          label: part,
          children: isLeaf ? undefined : [],
          variables: isLeaf ? [] : undefined,
        });
      }

      node = nodeMap.get(id);

      if (!node) return; // should never reach

      if (parentId) {
        const parent = nodeMap.get(parentId);
        if (!parent) return; // should never reach
        if (parent.children?.includes(node)) return;
        parent.children?.push(node);
      }

      if (index === 0) rootNodesSet.add(node);
    });

    if (node) {
      const variableName = partsToVariableName(parts);
      // for the case that a node should have both children & variables
      if (!node.variables) {
        node.variables = [];
      }
      const variable = {
        id: variableName,
        name: parts[parts.length - 1],
        variableName,
        light: light[variableName],
        dark: dark[variableName],
        ancestors,
      };
      node.variables.push(variable);
      variableMap.set(variableName, variable);
    }
  });

  return {
    tree: sortTree(Array.from(rootNodesSet)),
    nodeMap,
    variableMap,
  };
};

export const affineThemes = {
  v1: getTree(lightCssVariables, darkCssVariables),
  v2: getTree(lightCssVariablesV2, darkCssVariablesV2),
};
