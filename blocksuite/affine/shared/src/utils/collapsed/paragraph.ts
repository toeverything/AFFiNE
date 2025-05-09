import { ParagraphBlockModel } from '@blocksuite/affine-model';
import type { BlockModel } from '@blocksuite/store';

import { matchModels } from '../model/checker.js';

export function calculateCollapsedSiblings(
  model: ParagraphBlockModel
): BlockModel[] {
  const parent = model.parent;
  if (!parent) return [];
  const children = parent.children;
  const index = children.indexOf(model);
  if (index === -1) return [];

  const collapsedEdgeIndex = children.findIndex((child, i) => {
    if (
      i > index &&
      matchModels(child, [ParagraphBlockModel]) &&
      child.props.type.startsWith('h')
    ) {
      const modelLevel = parseInt(model.props.type.slice(1));
      const childLevel = parseInt(child.props.type.slice(1));
      return childLevel <= modelLevel;
    }
    return false;
  });

  let collapsedSiblings: BlockModel[];
  if (collapsedEdgeIndex === -1) {
    collapsedSiblings = children.slice(index + 1);
  } else {
    collapsedSiblings = children.slice(index + 1, collapsedEdgeIndex);
  }

  return collapsedSiblings;
}

export function getNearestHeadingBefore(
  model: BlockModel
): ParagraphBlockModel | null {
  const parent = model.parent;
  if (!parent) return null;
  const index = parent.children.indexOf(model);
  if (index === -1) return null;

  for (let i = index - 1; i >= 0; i--) {
    const sibling = parent.children[i];
    if (
      matchModels(sibling, [ParagraphBlockModel]) &&
      sibling.props.type.startsWith('h')
    ) {
      return sibling;
    }
  }

  return null;
}
