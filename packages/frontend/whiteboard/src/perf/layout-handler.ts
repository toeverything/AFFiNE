import {
  BlockLayoutHandlerExtension,
  BlockLayoutHandlersIdentifier,
  type Rect,
} from '@blocksuite/affine/gfx/turbo-renderer';
import type { EditorHost } from '@blocksuite/affine/std';
import type { ViewportRecord } from '@blocksuite/affine/std/gfx';
import type { BlockModel, ExtensionType } from '@blocksuite/affine/store';
import type { Container } from '@blocksuite/global/di';

import { WHITEBOARD_FLAVOURS } from '../const';
import type { WhiteboardWidgetLayout } from './painter.worker';
import { snapshotBitmap } from './snapshot-bitmap';

const FILLS: Record<string, string> = {
  [WHITEBOARD_FLAVOURS.hello]: '#f3f4f6',
  [WHITEBOARD_FLAVOURS.chart]: '#dbeafe',
  [WHITEBOARD_FLAVOURS.sketch]: '#fef3c7',
  [WHITEBOARD_FLAVOURS.board]: '#dcfce7',
};

function readXywh(model: BlockModel) {
  const gfx = model as BlockModel & { xywh?: string };
  if (typeof gfx.xywh === 'string') return gfx.xywh;
  const props = model.props as { xywh?: string };
  return props.xywh;
}

function readTitle(model: BlockModel) {
  const title = (
    model.props as { title?: { toString?: () => string } | string }
  ).title;
  if (!title) return model.flavour;
  return typeof title === 'string'
    ? title
    : (title.toString?.() ?? model.flavour);
}

function parseRect(xywh?: string): Rect | null {
  if (!xywh) return null;
  try {
    const parsed = JSON.parse(xywh) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 4) return null;
    const [x, y, w, h] = parsed as number[];
    return { x, y, w, h };
  } catch {
    return null;
  }
}

function createHandler(flavour: string) {
  return class WhiteboardWidgetLayoutHandler extends BlockLayoutHandlerExtension<WhiteboardWidgetLayout> {
    readonly blockType = flavour;

    static override setup(di: Container) {
      di.addImpl(
        BlockLayoutHandlersIdentifier(flavour),
        WhiteboardWidgetLayoutHandler
      );
    }

    override queryLayout(
      model: BlockModel,
      host: EditorHost,
      _viewportRecord: ViewportRecord
    ): WhiteboardWidgetLayout | null {
      const rect = parseRect(readXywh(model));
      if (!rect) return null;
      const snapshotId =
        (model.props as { snapshotBlobId?: string; snapshotSvgBlobId?: string })
          .snapshotSvgBlobId ??
        (model.props as { snapshotBlobId?: string }).snapshotBlobId;
      return {
        type: flavour,
        blockId: model.id,
        rect,
        title: readTitle(model),
        fill: FILLS[flavour] ?? '#f3f4f6',
        snapshotId,
        snapshot: snapshotId ? snapshotBitmap(host, snapshotId) : undefined,
      };
    }

    calculateBound(layout: WhiteboardWidgetLayout) {
      return { rect: layout.rect, subRects: [layout.rect] };
    }
  };
}

export const WhiteboardLayoutHandlerExtensions: ExtensionType[] = [
  createHandler(WHITEBOARD_FLAVOURS.hello),
  createHandler(WHITEBOARD_FLAVOURS.chart),
  createHandler(WHITEBOARD_FLAVOURS.sketch),
  createHandler(WHITEBOARD_FLAVOURS.board),
];
