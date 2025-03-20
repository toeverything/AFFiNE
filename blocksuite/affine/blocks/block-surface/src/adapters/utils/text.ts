import type { DeltaInsert } from '@blocksuite/store';

import type { MindMapTreeNode } from '../types/mindmap.js';
import { buildMindMapTree } from './mindmap.js';

export function getShapeType(elementModel: Record<string, unknown>): string {
  let shapeType = '';
  if (elementModel.type !== 'shape') {
    return shapeType;
  }

  if (
    'shapeType' in elementModel &&
    typeof elementModel.shapeType === 'string'
  ) {
    shapeType = elementModel.shapeType;
  }
  return shapeType;
}

export function getShapeText(elementModel: Record<string, unknown>): string {
  let text = '';
  if (elementModel.type !== 'shape') {
    return text;
  }

  if (
    'text' in elementModel &&
    typeof elementModel.text === 'object' &&
    elementModel.text
  ) {
    let delta: DeltaInsert[] = [];
    if ('delta' in elementModel.text) {
      delta = elementModel.text.delta as DeltaInsert[];
    }
    text = delta.map(d => d.insert).join('');
  }
  return text;
}

export function getConnectorText(
  elementModel: Record<string, unknown>
): string {
  let text = '';
  if (elementModel.type !== 'connector') {
    return text;
  }

  if (
    'text' in elementModel &&
    typeof elementModel.text === 'object' &&
    elementModel.text
  ) {
    let delta: DeltaInsert[] = [];
    if ('delta' in elementModel.text) {
      delta = elementModel.text.delta as DeltaInsert[];
    }
    text = delta.map(d => d.insert).join('');
  }
  return text;
}

export function getGroupTitle(elementModel: Record<string, unknown>): string {
  let title = '';
  if (elementModel.type !== 'group') {
    return title;
  }

  if (
    'title' in elementModel &&
    typeof elementModel.title === 'object' &&
    elementModel.title
  ) {
    let delta: DeltaInsert[] = [];
    if ('delta' in elementModel.title) {
      delta = elementModel.title.delta as DeltaInsert[];
    }
    title = delta.map(d => d.insert).join('');
  }
  return title;
}

export function getTextElementText(
  elementModel: Record<string, unknown>
): string {
  let text = '';
  if (elementModel.type !== 'text') {
    return text;
  }
  if (
    'text' in elementModel &&
    typeof elementModel.text === 'object' &&
    elementModel.text
  ) {
    let delta: DeltaInsert[] = [];
    if ('delta' in elementModel.text) {
      delta = elementModel.text.delta as DeltaInsert[];
    }
    text = delta.map(d => d.insert).join('');
  }
  return text;
}

/**
 * traverse the mindMapTree and construct the content string
 * like:
 * - Root
 *   - Child 1
 *     - Child 1.1
 *     - Child 1.2
 *   - Child 2
 *     - Child 2.1
 *     - Child 2.2
 *   - Child 3
 *     - Child 3.1
 *     - Child 3.2
 * @param elementModel - the mindmap element model
 * @param elements - the elements map
 * @returns the mindmap tree text
 */
export function getMindMapTreeText(
  elementModel: Record<string, unknown>,
  elements: Record<string, Record<string, unknown>>,
  options: {
    prefix: string;
    repeat: number;
  } = {
    prefix: ' ',
    repeat: 2,
  }
): string {
  let mindMapContent = '';
  if (elementModel.type !== 'mindmap') {
    return mindMapContent;
  }

  const mindMapTree = buildMindMapTree(elementModel);
  if (!mindMapTree) {
    return mindMapContent;
  }

  let layer = 0;
  const traverseMindMapTree = (
    node: MindMapTreeNode,
    prefix: string,
    repeat: number
  ) => {
    const shapeElement = elements[node.id as string];
    const shapeText = getShapeText(shapeElement);
    if (shapeElement) {
      mindMapContent += `${prefix.repeat(layer * repeat)}- ${shapeText}\n`;
    }
    node.children.forEach(child => {
      layer++;
      traverseMindMapTree(child, prefix, repeat);
      layer--;
    });
  };
  traverseMindMapTree(mindMapTree, options.prefix, options.repeat);

  return mindMapContent;
}
