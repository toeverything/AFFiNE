import { SurfaceBlockModel } from '@blocksuite/affine/blocks/surface';
import {
  MindmapElementModel,
  NoteBlockModel,
  RootBlockModel,
  type ShapeElementModel,
} from '@blocksuite/affine/model';
import { matchModels } from '@blocksuite/affine/shared/utils';
import type { BlockComponent } from '@blocksuite/affine/std';
import type { GfxModel } from '@blocksuite/affine/std/gfx';

export function mindMapToMarkdown(mindmap: MindmapElementModel) {
  let markdownStr = '';

  const traverse = (
    node: MindmapElementModel['tree']['children'][number],
    indent: number = 0
  ) => {
    const text = (node.element as ShapeElementModel).text?.toString() ?? '';

    markdownStr += `${'  '.repeat(indent)}- ${text}\n`;

    if (node.children) {
      node.children.forEach(node => traverse(node, indent + 2));
    }
  };

  traverse(mindmap.tree, 0);

  return markdownStr;
}

export function isMindMapRoot(ele: GfxModel) {
  const group = ele?.group;

  return group instanceof MindmapElementModel && group.tree.element === ele;
}

export function isMindmapChild(ele: GfxModel) {
  return ele?.group instanceof MindmapElementModel && !isMindMapRoot(ele);
}

export { getEdgelessCopilotWidget } from './get-edgeless-copilot-widget';

export function findNoteBlockModel(blockElement: BlockComponent) {
  let curBlock = blockElement;
  while (curBlock) {
    if (matchModels(curBlock.model, [NoteBlockModel])) {
      return curBlock.model;
    }
    if (matchModels(curBlock.model, [RootBlockModel, SurfaceBlockModel])) {
      return null;
    }
    if (!curBlock.parentComponent) {
      break;
    }
    curBlock = curBlock.parentComponent;
  }
  return null;
}
