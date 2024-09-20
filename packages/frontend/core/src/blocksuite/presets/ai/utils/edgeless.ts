import type { BlockComponent, EditorHost } from '@blocksuite/affine/block-std';
import {
  AFFINE_EDGELESS_COPILOT_WIDGET,
  type EdgelessCopilotWidget,
  type EdgelessRootService,
  matchFlavours,
  MindmapElementModel,
  type ShapeElementModel,
} from '@blocksuite/affine/blocks';

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

export function isMindMapRoot(ele: BlockSuite.EdgelessModel) {
  const group = ele?.group;

  return group instanceof MindmapElementModel && group.tree.element === ele;
}

export function isMindmapChild(ele: BlockSuite.EdgelessModel) {
  return ele?.group instanceof MindmapElementModel && !isMindMapRoot(ele);
}

export function getService(host: EditorHost) {
  const edgelessService = host.std.getService(
    'affine:page'
  ) as EdgelessRootService;

  return edgelessService;
}

export function getEdgelessCopilotWidget(
  host: EditorHost
): EdgelessCopilotWidget {
  const rootBlockId = host.doc.root?.id as string;
  const copilotWidget = host.view.getWidget(
    AFFINE_EDGELESS_COPILOT_WIDGET,
    rootBlockId
  ) as EdgelessCopilotWidget;

  return copilotWidget;
}

export function findNoteBlockModel(blockElement: BlockComponent) {
  let curBlock = blockElement;
  while (curBlock) {
    if (matchFlavours(curBlock.model, ['affine:note'])) {
      return curBlock.model;
    }
    if (matchFlavours(curBlock.model, ['affine:page', 'affine:surface'])) {
      return null;
    }
    if (!curBlock.parentComponent) {
      break;
    }
    curBlock = curBlock.parentComponent;
  }
  return null;
}
