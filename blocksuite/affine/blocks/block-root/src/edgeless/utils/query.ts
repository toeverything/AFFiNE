import type { CanvasElementWithText } from '@blocksuite/affine-block-surface';
import {
  type AttachmentBlockModel,
  type BookmarkBlockModel,
  type Connectable,
  ConnectorElementModel,
  type EdgelessTextBlockModel,
  type EmbedBlockModel,
  type EmbedFigmaModel,
  type EmbedGithubModel,
  type EmbedHtmlModel,
  type EmbedLinkedDocModel,
  type EmbedLoomModel,
  type EmbedSyncedDocModel,
  type EmbedYoutubeModel,
  type ImageBlockModel,
  ShapeElementModel,
  TextElementModel,
} from '@blocksuite/affine-model';
import {
  getElementsWithoutGroup,
  isTopLevelBlock,
} from '@blocksuite/affine-shared/utils';
import type {
  GfxModel,
  GfxPrimitiveElementModel,
  GfxToolsFullOptionValue,
  Viewport,
} from '@blocksuite/block-std/gfx';
import type { PointLocation } from '@blocksuite/global/gfx';
import { Bound } from '@blocksuite/global/gfx';
import type { BlockModel } from '@blocksuite/store';

export function isEdgelessTextBlock(
  element: BlockModel | GfxModel | null
): element is EdgelessTextBlockModel {
  return (
    !!element &&
    'flavour' in element &&
    element.flavour === 'affine:edgeless-text'
  );
}

export function isImageBlock(
  element: BlockModel | GfxModel | null
): element is ImageBlockModel {
  return (
    !!element && 'flavour' in element && element.flavour === 'affine:image'
  );
}

export function isAttachmentBlock(
  element: BlockModel | GfxModel | null
): element is AttachmentBlockModel {
  return (
    !!element && 'flavour' in element && element.flavour === 'affine:attachment'
  );
}

export function isBookmarkBlock(
  element: BlockModel | GfxModel | null
): element is BookmarkBlockModel {
  return (
    !!element && 'flavour' in element && element.flavour === 'affine:bookmark'
  );
}

export function isEmbeddedBlock(
  element: BlockModel | GfxModel | null
): element is EmbedBlockModel {
  return (
    !!element && 'flavour' in element && /affine:embed-*/.test(element.flavour)
  );
}

/**
 * TODO: Remove this function after the edgeless refactor completed
 * This function is used to check if the block is an AI chat block for edgeless selected rect
 * Should not be used in the future
 * Related issue: https://linear.app/affine-design/issue/BS-1009/
 * @deprecated
 */
export function isAIChatBlock(element: BlockModel | GfxModel | null) {
  return (
    !!element &&
    'flavour' in element &&
    element.flavour === 'affine:embed-ai-chat'
  );
}

/**
 * TODO: Remove this function after the edgeless refactor completed
 * This function is used to check if the block is an EmbedIframeBlock for edgeless selected rect
 * Should not be used in the future
 * Related issue: https://linear.app/affine-design/issue/BS-2841/
 * @deprecated
 */
export function isEmbedIframeBlock(element: BlockModel | GfxModel | null) {
  return (
    !!element &&
    'flavour' in element &&
    element.flavour === 'affine:embed-iframe'
  );
}

export function isEmbeddedLinkBlock(element: BlockModel | GfxModel | null) {
  return (
    isEmbeddedBlock(element) &&
    !isEmbedSyncedDocBlock(element) &&
    !isEmbedLinkedDocBlock(element)
  );
}

export function isEmbedGithubBlock(
  element: BlockModel | GfxModel | null
): element is EmbedGithubModel {
  return (
    !!element &&
    'flavour' in element &&
    element.flavour === 'affine:embed-github'
  );
}

export function isEmbedYoutubeBlock(
  element: BlockModel | GfxModel | null
): element is EmbedYoutubeModel {
  return (
    !!element &&
    'flavour' in element &&
    element.flavour === 'affine:embed-youtube'
  );
}

export function isEmbedLoomBlock(
  element: BlockModel | GfxModel | null
): element is EmbedLoomModel {
  return (
    !!element && 'flavour' in element && element.flavour === 'affine:embed-loom'
  );
}

export function isEmbedFigmaBlock(
  element: BlockModel | GfxModel | null
): element is EmbedFigmaModel {
  return (
    !!element &&
    'flavour' in element &&
    element.flavour === 'affine:embed-figma'
  );
}

export function isEmbedLinkedDocBlock(
  element: BlockModel | GfxModel | null
): element is EmbedLinkedDocModel {
  return (
    !!element &&
    'flavour' in element &&
    element.flavour === 'affine:embed-linked-doc'
  );
}

export function isEmbedSyncedDocBlock(
  element: BlockModel | GfxModel | null
): element is EmbedSyncedDocModel {
  return (
    !!element &&
    'flavour' in element &&
    element.flavour === 'affine:embed-synced-doc'
  );
}

export function isEmbedHtmlBlock(
  element: BlockModel | GfxModel | null
): element is EmbedHtmlModel {
  return (
    !!element && 'flavour' in element && element.flavour === 'affine:embed-html'
  );
}

export function isCanvasElement(
  selectable: GfxModel | BlockModel | null
): selectable is GfxPrimitiveElementModel {
  return !isTopLevelBlock(selectable);
}

export function isCanvasElementWithText(
  element: GfxModel
): element is CanvasElementWithText {
  return (
    element instanceof TextElementModel || element instanceof ShapeElementModel
  );
}

export function isConnectable(
  element: GfxModel | null
): element is Connectable {
  return !!element && element.connectable;
}

export function getSelectionBoxBound(viewport: Viewport, bound: Bound) {
  const { w, h } = bound;
  const [x, y] = viewport.toViewCoord(bound.x, bound.y);
  return new DOMRect(x, y, w * viewport.zoom, h * viewport.zoom);
}

// https://developer.mozilla.org/en-US/docs/Web/CSS/cursor
export function getCursorMode(edgelessTool: GfxToolsFullOptionValue | null) {
  if (!edgelessTool) {
    return 'default';
  }
  switch (edgelessTool.type) {
    case 'default':
      return 'default';
    case 'pan':
      return edgelessTool.panning ? 'grabbing' : 'grab';
    case 'brush':
    case 'eraser':
    case 'shape':
    case 'connector':
    case 'frame':
    case 'lasso':
      return 'crosshair';
    case 'text':
      return 'text';
    default:
      return 'default';
  }
}

export type SelectableProps = {
  bound: Bound;
  rotate: number;
  path?: PointLocation[];
};

export function getSelectableBounds(
  selected: GfxModel[]
): Map<string, SelectableProps> {
  const bounds = new Map();
  getElementsWithoutGroup(selected).forEach(ele => {
    const bound = Bound.deserialize(ele.xywh);
    const props: SelectableProps = {
      bound,
      rotate: ele.rotate,
    };

    if (isCanvasElement(ele) && ele instanceof ConnectorElementModel) {
      props.path = ele.absolutePath.map(p => p.clone());
    }

    bounds.set(ele.id, props);
  });

  return bounds;
}
