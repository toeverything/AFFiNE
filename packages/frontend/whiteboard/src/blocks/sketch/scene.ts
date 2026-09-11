import type { SketchElement, SketchScene } from './types';

export function createEmptyScene(): SketchScene {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'affine-whiteboard',
    elements: [],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  };
}

export function isExcalidrawScene(value: unknown): value is SketchScene {
  if (!value || typeof value !== 'object') return false;
  const scene = value as Partial<SketchScene>;
  return scene.type === 'excalidraw' && Array.isArray(scene.elements);
}

export function normalizeScene(value: unknown): SketchScene {
  if (!isExcalidrawScene(value)) return createEmptyScene();
  return {
    type: 'excalidraw',
    version: 2,
    source: value.source || 'affine-whiteboard',
    elements: value.elements.filter(
      (element): element is SketchElement =>
        !!element && typeof element === 'object' && !element.isDeleted
    ),
    appState: {
      viewBackgroundColor: value.appState?.viewBackgroundColor || '#ffffff',
    },
    files: value.files && typeof value.files === 'object' ? value.files : {},
  };
}

export function parseExcalidrawJson(text: string): SketchScene {
  try {
    return normalizeScene(JSON.parse(text));
  } catch {
    return createEmptyScene();
  }
}

export function serializeScene(scene: SketchScene): string {
  return JSON.stringify(normalizeScene(scene));
}

async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return bytes;
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('gzip is not supported');
    }
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return bytes;
}

export async function encodeSceneBlob(scene: SketchScene): Promise<Blob> {
  const json = serializeScene(scene);
  const compressed = await compress(new TextEncoder().encode(json));
  return new Blob([compressed as BlobPart], {
    type: 'application/vnd.excalidraw+json',
  });
}

export async function decodeSceneBlob(blob: Blob): Promise<SketchScene> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const raw = await decompress(bytes);
  return parseExcalidrawJson(new TextDecoder().decode(raw));
}

export function createElement(
  type: SketchElement['type'],
  box: { x: number; y: number; width: number; height: number },
  extra: Partial<SketchElement> = {}
): SketchElement {
  return {
    id: `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    x: box.x,
    y: box.y,
    width: Math.max(1, box.width),
    height: Math.max(1, box.height),
    strokeColor: extra.strokeColor ?? '#1e1e1e',
    backgroundColor: extra.backgroundColor ?? 'transparent',
    strokeWidth: extra.strokeWidth ?? 2,
    opacity: extra.opacity ?? 100,
    text: extra.text,
    fontSize: extra.fontSize,
    points: extra.points,
  };
}
