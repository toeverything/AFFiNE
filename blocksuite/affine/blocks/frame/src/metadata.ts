import {
  CanvasRenderer,
  EdgelessCRUDIdentifier,
  ExportManager,
  type SurfaceBlockComponent,
} from '@blocksuite/affine-block-surface';
import { toast } from '@blocksuite/affine-components/toast';
import {
  ConnectorElementModel,
  FrameBlockModel,
} from '@blocksuite/affine-model';
import {
  decodeClipboardBlobs,
  encodeClipboardBlobs,
} from '@blocksuite/affine-shared/adapters';
import type { ToolbarContext } from '@blocksuite/affine-shared/services';
import {
  downloadBlob,
  embedPngMetadata,
  extractPngMetadata,
  isTopLevelBlock,
  openSingleFileWith,
} from '@blocksuite/affine-shared/utils';
import { Bound, getCommonBoundWithRotation } from '@blocksuite/global/gfx';
import type { BlockStdScope } from '@blocksuite/std';
import {
  getTopElements,
  GfxBlockElementModel,
  GfxControllerIdentifier,
  type GfxModel,
  GfxPrimitiveElementModel,
  isGfxGroupCompatibleModel,
  type SerializedElement,
} from '@blocksuite/std/gfx';
import type { BlockSnapshot } from '@blocksuite/store';

import { createElementsFromClipboardData } from './clipboard/create-elements';
import {
  type EdgelessFrameManager,
  EdgelessFrameManagerIdentifier,
} from './frame-manager';

type BoundObject = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type FrameFileSnapshot = {
  name: string;
  type: string;
  content: string;
};

type FrameMetadataPayload = {
  version: number;
  snapshot: (SerializedElement | BlockSnapshot)[];
  blobs?: Record<string, FrameFileSnapshot>;
  frame?: {
    xywh?: string;
    background?: string;
  };
  frameBound?: BoundObject;
  elementsBound?: BoundObject;
};

const FRAME_METADATA_VERSION = 1;

function toBoundObject(bound: Bound): BoundObject {
  return { x: bound.x, y: bound.y, w: bound.w, h: bound.h };
}

function toBoundCenter(bound: Bound) {
  return {
    x: bound.x + bound.w / 2,
    y: bound.y + bound.h / 2,
  };
}

function fromBoundObject(bound?: BoundObject | null) {
  if (!bound) return null;
  return new Bound(bound.x, bound.y, bound.w, bound.h);
}

function sanitizeFileName(name: string) {
  const noControls = Array.from(name, ch =>
    ch.charCodeAt(0) < 32 ? ' ' : ch
  ).join('');
  return noControls
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFrameFileName(
  frame: FrameBlockModel,
  ext: string,
  caption?: string
) {
  const title = frame.props.title?.toString()?.trim() || 'Frame';
  const safeTitle = sanitizeFileName(title) || 'Frame';
  const safeCaption = caption ? sanitizeFileName(caption) : '';
  const suffix = safeCaption ? `_${safeCaption}` : '';
  return `${safeTitle}${suffix}.${ext}`;
}

function cropExportCanvas(canvas: HTMLCanvasElement, bound: Bound) {
  const paddedWidth = bound.w + 100;
  const dpr = paddedWidth > 0 ? canvas.width / paddedWidth : 1;
  const padding = Math.round(50 * dpr);
  const width = canvas.width - padding * 2;
  const height = canvas.height - padding * 2;
  if (width <= 0 || height <= 0) return canvas;

  const cropped = document.createElement('canvas');
  cropped.width = width;
  cropped.height = height;
  const ctx = cropped.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(canvas, padding, padding, width, height, 0, 0, width, height);
  return cropped;
}

function normalizeFrameMetadata(data: unknown): FrameMetadataPayload | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const affine =
    root.affine && typeof root.affine === 'object'
      ? (root.affine as Record<string, unknown>)
      : root;
  const type = affine.type;
  if (type !== 'frame' && type !== 'affine/frame') return null;
  if (!Array.isArray(affine.snapshot)) return null;

  return {
    version:
      typeof affine.version === 'number'
        ? affine.version
        : FRAME_METADATA_VERSION,
    snapshot: affine.snapshot as (SerializedElement | BlockSnapshot)[],
    blobs: affine.blobs as Record<string, FrameFileSnapshot> | undefined,
    frame: affine.frame as FrameMetadataPayload['frame'],
    frameBound: affine.frameBound as BoundObject | undefined,
    elementsBound: affine.elementsBound as BoundObject | undefined,
  };
}

function getFrameElements(
  frameManager: EdgelessFrameManager,
  frame: FrameBlockModel
) {
  return frameManager
    .getElementsInFrameBound(frame)
    .filter((element: GfxModel) => {
      const parentFrame = frameManager.getParentFrame(element);
      return parentFrame === frame || parentFrame === null;
    });
}

async function buildMetadataPayload(
  std: BlockStdScope,
  frame: FrameBlockModel,
  elements: GfxModel[],
  onError?: (message: string) => void
) {
  const sortedElements = getSortedCloneElements(elements);
  const transformer = std.store.getTransformer();
  const ids = new Set(sortedElements.map(element => element.id));
  const snapshot: (SerializedElement | BlockSnapshot)[] = [];

  for (const element of sortedElements) {
    const data = serializeFrameElement(element, ids, transformer);
    if (!data) continue;
    if (
      element instanceof GfxBlockElementModel &&
      (element.flavour === 'affine:image' ||
        element.flavour === 'affine:attachment')
    ) {
      const sourceId = (data as BlockSnapshot).props?.sourceId as
        | string
        | undefined;
      if (sourceId) {
        await transformer.assetsManager.readFromBlob(sourceId);
      }
    }
    snapshot.push(data);
  }

  const blobs = await encodeClipboardBlobs(
    transformer.assetsManager.getAssets(),
    onError
  );
  const frameBound = Bound.deserialize(frame.xywh);
  const elementsBound = getCommonBoundWithRotation(sortedElements);
  const payload = {
    affine: {
      type: 'frame',
      version: FRAME_METADATA_VERSION,
      frame: {
        xywh: frame.xywh,
        background: frame.props.background,
      },
      frameBound: toBoundObject(frameBound),
      elementsBound: toBoundObject(elementsBound),
      snapshot,
      blobs,
    },
  };

  return { payload, sortedElements };
}

function resolveFrameInStd(std: BlockStdScope, frame: FrameBlockModel) {
  const model = std.store.getModelById(frame.id);
  return model instanceof FrameBlockModel ? model : null;
}

async function renderFrameToCanvas(
  std: BlockStdScope,
  frame: FrameBlockModel,
  elements: GfxModel[]
) {
  const gfx = std.getOptional(GfxControllerIdentifier);
  if (!gfx) return null;
  const surfaceBlock = gfx.surfaceComponent as SurfaceBlockComponent | null;
  if (!surfaceBlock || !(surfaceBlock.renderer instanceof CanvasRenderer)) {
    return null;
  }

  const exportManager =
    std.getOptional(ExportManager) ?? new ExportManager(std);
  const bound = Bound.deserialize(frame.xywh);
  const blocks: GfxBlockElementModel[] = [];
  const primitives: GfxPrimitiveElementModel[] = [];

  const pushElement = (element: GfxModel) => {
    if (element instanceof GfxBlockElementModel) {
      blocks.push(element);
    } else if (element instanceof GfxPrimitiveElementModel) {
      primitives.push(element);
    }
  };

  pushElement(frame);
  elements.forEach(pushElement);

  return exportManager.edgelessToCanvas(
    surfaceBlock.renderer,
    bound,
    gfx,
    blocks,
    primitives
  );
}

function sortEdgelessElements(elements: GfxModel[]) {
  if (elements.length === 0) return [];

  const result: GfxModel[] = [];
  const topElements = getTopElements(elements);
  const moveConnectorToEnd = (models: GfxModel[]) => {
    const connectors = models.filter(
      element => element instanceof ConnectorElementModel
    );
    const rest = models.filter(
      element => !(element instanceof ConnectorElementModel)
    );
    return [...rest, ...connectors];
  };

  const traverse = (element: GfxModel) => {
    if (isGfxGroupCompatibleModel(element)) {
      moveConnectorToEnd(element.childElements).forEach(child =>
        traverse(child)
      );
    }
    result.push(element);
  };

  moveConnectorToEnd(topElements).forEach(element => traverse(element));
  return result;
}

function getSortedCloneElements(elements: GfxModel[]) {
  const set = new Set<GfxModel>();
  elements.forEach(element => {
    if (set.has(element)) return;
    set.add(element);
    if (isGfxGroupCompatibleModel(element)) {
      element.descendantElements.forEach(descendant => set.add(descendant));
    }
  });
  return sortEdgelessElements([...set]);
}

function serializeConnector(
  connector: ConnectorElementModel,
  ids: Set<string>
) {
  const sourceId = connector.source?.id;
  const targetId = connector.target?.id;
  const serialized = connector.serialize();
  if (sourceId && !ids.has(sourceId)) {
    serialized.source = { position: connector.absolutePath[0] };
  }
  if (targetId && !ids.has(targetId)) {
    serialized.target = {
      position: connector.absolutePath[connector.absolutePath.length - 1],
    };
  }
  return serialized;
}

function serializeFrameElement(
  element: GfxModel,
  ids: Set<string>,
  transformer: ReturnType<ToolbarContext['store']['getTransformer']>
) {
  if (element instanceof GfxBlockElementModel) {
    const snapshot = transformer.blockToSnapshot(element);
    if (!snapshot) return null;
    return { ...snapshot } as BlockSnapshot;
  }
  if (element instanceof ConnectorElementModel) {
    return serializeConnector(element, ids);
  }
  return element.serialize();
}

function getImportPasteCenter(
  sourceFrameBound: Bound | null,
  sourceElementsBound: Bound | null,
  targetFrameBound: Bound
) {
  const targetCenter = toBoundCenter(targetFrameBound);
  if (!sourceFrameBound || !sourceElementsBound) {
    return [targetCenter.x, targetCenter.y] as [number, number];
  }
  const sourceFrameCenter = toBoundCenter(sourceFrameBound);
  const sourceElementsCenter = toBoundCenter(sourceElementsBound);
  const offsetX = sourceElementsCenter.x - sourceFrameCenter.x;
  const offsetY = sourceElementsCenter.y - sourceFrameCenter.y;
  return [targetCenter.x + offsetX, targetCenter.y + offsetY] as [
    number,
    number,
  ];
}

export async function exportFrameMetadata(
  ctx: ToolbarContext,
  frame: FrameBlockModel
) {
  const frameManager = ctx.std.get(EdgelessFrameManagerIdentifier);
  const elements = getFrameElements(frameManager, frame);
  const { payload } = await buildMetadataPayload(
    ctx.std,
    frame,
    elements,
    message => toast(ctx.host, message)
  );

  const title = frame.props.title?.toString()?.trim() || 'Frame';
  const safeTitle = sanitizeFileName(title) || 'Frame';
  const fileName = `${safeTitle}.affine-frame.json`;
  const json = JSON.stringify(payload);
  downloadBlob(new Blob([json], { type: 'application/json' }), fileName);
  toast(ctx.host, 'Frame metadata exported.');
}

export async function exportFramePng(
  ctx: ToolbarContext,
  frame: FrameBlockModel,
  renderStd?: BlockStdScope,
  options?: { caption?: string }
) {
  const payload = await buildFramePngPayload(
    ctx.std,
    frame,
    renderStd,
    options,
    message => toast(ctx.host, message)
  );
  if (!payload) {
    toast(ctx.host, 'Failed to export frame image.');
    return;
  }
  downloadBlob(payload.blob, payload.fileName);
  toast(ctx.host, 'Frame PNG exported.');
}

export async function buildFramePngPayload(
  std: BlockStdScope,
  frame: FrameBlockModel,
  renderStd?: BlockStdScope,
  options?: { caption?: string },
  onError?: (message: string) => void
) {
  const activeStd = renderStd ?? std;
  const frameManager = activeStd.getOptional(EdgelessFrameManagerIdentifier);
  const renderFrame = resolveFrameInStd(activeStd, frame) ?? frame;
  if (!frameManager || !renderFrame) {
    return null;
  }
  const elements = getFrameElements(frameManager, renderFrame);
  const { payload } = await buildMetadataPayload(
    activeStd,
    renderFrame,
    elements,
    onError
  );
  const canvas = await renderFrameToCanvas(activeStd, renderFrame, elements);
  if (!canvas) {
    return null;
  }

  const exportCanvas = cropExportCanvas(
    canvas,
    Bound.deserialize(renderFrame.xywh)
  );

  const blob = await new Promise<Blob | null>(resolve =>
    exportCanvas.toBlob(resolve, 'image/png')
  );
  if (!blob) {
    return null;
  }

  const enriched = embedPngMetadata(
    await blob.arrayBuffer(),
    'affine',
    JSON.stringify(payload)
  );
  const fileName = buildFrameFileName(renderFrame, 'png', options?.caption);
  return {
    blob: new Blob([new Uint8Array(enriched)], { type: 'image/png' }),
    fileName,
  };
}

async function parseFrameMetadataFromPng(file: File) {
  const metadataText = extractPngMetadata(await file.arrayBuffer(), 'affine');
  if (!metadataText) return null;
  try {
    return normalizeFrameMetadata(JSON.parse(metadataText));
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function extractFrameMetadataFromImage(file: File) {
  return parseFrameMetadataFromPng(file);
}

export async function importFrameMetadata(
  ctx: ToolbarContext,
  frame: FrameBlockModel
) {
  const file = await openSingleFileWith('Any');
  if (!file) return;

  toast(ctx.host, 'Importing frame metadata...');

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    console.error(error);
    toast(ctx.host, 'Invalid frame metadata file.');
    return;
  }

  const metadata = normalizeFrameMetadata(parsed);
  if (!metadata) {
    toast(ctx.host, 'No AFFiNE frame metadata found.');
    return;
  }
  await applyFrameMetadata(ctx, frame, metadata, true);
  toast(ctx.host, 'Frame metadata imported.');
}

export async function importFramePng(
  ctx: ToolbarContext,
  frame: FrameBlockModel
) {
  const file = await openSingleFileWith('Images');
  if (!file) return;

  toast(ctx.host, 'Importing frame image...');
  const metadata = await parseFrameMetadataFromPng(file);
  if (!metadata) {
    toast(ctx.host, 'No AFFiNE frame metadata found in PNG.');
    return;
  }
  await applyFrameMetadata(ctx, frame, metadata, true);
  toast(ctx.host, 'Frame PNG imported.');
}

async function applyFrameMetadata(
  ctx: Pick<ToolbarContext, 'std' | 'store'> & {
    host?: ToolbarContext['host'];
  },
  frame: FrameBlockModel,
  metadata: FrameMetadataPayload,
  replaceContents: boolean
) {
  const frameManager = ctx.std.get(EdgelessFrameManagerIdentifier);
  const crud = ctx.std.get(EdgelessCRUDIdentifier);
  const gfx = ctx.std.get(GfxControllerIdentifier);
  const transformer = ctx.store.getTransformer();
  const currentBound = Bound.deserialize(frame.xywh);

  const sourceFrameBound =
    fromBoundObject(metadata.frameBound) ??
    (metadata.frame?.xywh ? Bound.deserialize(metadata.frame.xywh) : null);
  const sourceElementsBound = fromBoundObject(metadata.elementsBound);
  let targetFrameBound = currentBound;

  ctx.store.captureSync();

  if (sourceFrameBound) {
    const currentCenter = toBoundCenter(currentBound);
    targetFrameBound = new Bound(
      currentCenter.x - sourceFrameBound.w / 2,
      currentCenter.y - sourceFrameBound.h / 2,
      sourceFrameBound.w,
      sourceFrameBound.h
    );

    const props: Record<string, unknown> = {
      xywh: targetFrameBound.serialize(),
    };
    if (metadata.frame?.background) {
      props.background = metadata.frame.background;
    }
    crud.updateElement(frame.id, props);
  }

  if (replaceContents) {
    const existingElements = frameManager
      .getElementsInFrameBound(frame)
      .filter(element => {
        const parentFrame = frameManager.getParentFrame(element);
        return parentFrame === frame || parentFrame === null;
      });
    if (existingElements.length > 0) {
      crud.deleteElements(getSortedCloneElements(existingElements));
    }
    frameManager.removeAllChildrenFromFrame(frame);
  }

  if (metadata.blobs) {
    decodeClipboardBlobs(metadata.blobs, transformer.assetsManager.getAssets());
    for (const blobId of transformer.assetsManager.getAssets().keys()) {
      await transformer.assetsManager.writeToBlob(blobId);
    }
  }

  const pasteCenter = getImportPasteCenter(
    sourceFrameBound,
    sourceElementsBound,
    targetFrameBound
  );
  const { canvasElements, blockModels } = await createElementsFromClipboardData(
    ctx.std,
    metadata.snapshot,
    pasteCenter
  );
  const createdElements = [...canvasElements, ...blockModels];
  frameManager.addElementsToFrame(frame, getTopElements(createdElements));

  const blockIds = blockModels
    .map(block => ctx.store.getModelById(block.id))
    .filter(isTopLevelBlock)
    .map(block => block.id);
  gfx.selection.set({
    editing: false,
    elements: [...canvasElements.map(element => element.id), ...blockIds],
  });
}

export async function createFrameFromMetadata(
  std: BlockStdScope,
  metadata: FrameMetadataPayload,
  options?: { bound?: Bound; center?: { x: number; y: number } }
) {
  const frameManager = std.getOptional(EdgelessFrameManagerIdentifier);
  const gfx = std.getOptional(GfxControllerIdentifier);
  if (!frameManager || !gfx) return null;

  const sourceFrameBound =
    fromBoundObject(metadata.frameBound) ??
    (metadata.frame?.xywh ? Bound.deserialize(metadata.frame.xywh) : null);
  const width = sourceFrameBound?.w ?? 600;
  const height = sourceFrameBound?.h ?? 400;
  const center = options?.center ?? gfx.viewport.center;
  const initialBound = options?.bound
    ? options.bound
    : new Bound(center.x - width / 2, center.y - height / 2, width, height);

  // Prefer placing the first imported frame to the right of existing canvas
  // content (e.g. page note block in edgeless) to avoid overlap.
  const noExistingFrames = frameManager.frames.length === 0;
  const canvasBound = gfx.elementsBound;
  const hasCanvasBound =
    Number.isFinite(canvasBound.x) &&
    Number.isFinite(canvasBound.y) &&
    Number.isFinite(canvasBound.w) &&
    Number.isFinite(canvasBound.h) &&
    canvasBound.w > 0 &&
    canvasBound.h > 0;
  const firstFrameBound =
    !options?.bound && noExistingFrames && hasCanvasBound
      ? new Bound(
          canvasBound.x + canvasBound.w + 80,
          canvasBound.y,
          width,
          height
        )
      : initialBound;

  const placedBound = findNonOverlappingBound(frameManager, firstFrameBound);

  const frame = frameManager.createFrameOnBound(placedBound);
  await applyFrameMetadata({ std, store: std.store }, frame, metadata, true);
  return frame;
}

function findNonOverlappingBound(
  frameManager: EdgelessFrameManager,
  bound: Bound
) {
  const gap = 80;
  const frames = frameManager.frames.map(frame =>
    Bound.deserialize(frame.xywh)
  );
  if (frames.length === 0) {
    return bound;
  }
  const minY = Math.min(...frames.map(frame => frame.y));
  const maxRight = Math.max(...frames.map(frame => frame.x + frame.w));
  const fallback = new Bound(maxRight + gap, minY, bound.w, bound.h);
  if (!frames.some(frame => frame.isOverlapWithBound(fallback))) {
    return fallback;
  }

  const maxAttempts = 200;
  const start = new Bound(bound.x, bound.y, bound.w, bound.h);
  let candidate = start;
  for (let i = 0; i < maxAttempts; i += 1) {
    const overlaps = frames.some(frame => frame.isOverlapWithBound(candidate));
    if (!overlaps) return candidate;

    const step = i + 1;
    const dx = (step % 10) * (bound.w + gap);
    const dy = Math.floor(step / 10) * (bound.h + gap);
    candidate = new Bound(start.x + dx, start.y + dy, bound.w, bound.h);
  }

  return candidate;
}
