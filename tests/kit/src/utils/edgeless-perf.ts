import type { Page } from '@playwright/test';

import { locateEditorContainer } from './editor';

export type CanvasRendererPerfSnapshot = {
  heapMemory: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  } | null;
  layerSequence: Array<'block' | 'canvas'>;
  metrics: Record<string, unknown> | null;
  rendererType: string | null;
  selectedIds: string[];
};

export type SeedEdgelessPerfSceneOptions = {
  height?: number;
  interleaved?: boolean;
  noteCount?: number;
  rowLength?: number;
  shapeCount?: number;
  startX?: number;
  startY?: number;
  width?: number;
};

export async function getCanvasRendererPerfSnapshot(
  page: Page,
  editorIndex = 0
): Promise<CanvasRendererPerfSnapshot> {
  const container = locateEditorContainer(page, editorIndex);
  return container.evaluate(container => {
    type PerfMemory = {
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
      usedJSHeapSize: number;
    };
    type PerfRenderer = {
      constructor?: { name?: string };
      getDebugMetrics?: () => Record<string, unknown>;
      resetDebugMetrics?: () => void;
    };

    const root = container.querySelector('affine-edgeless-root');
    const surface = container.querySelector('affine-surface');

    if (!root) {
      throw new Error('Edgeless root not found');
    }

    if (!surface) {
      throw new Error('Surface block not found');
    }

    const renderer = surface.renderer as PerfRenderer | undefined;
    const metrics =
      renderer &&
      typeof renderer.getDebugMetrics === 'function' &&
      renderer.constructor?.name === 'CanvasRenderer'
        ? renderer.getDebugMetrics()
        : null;
    const memory = (
      performance as Performance & {
        memory?: PerfMemory;
      }
    ).memory;

    return {
      rendererType: renderer?.constructor?.name ?? null,
      metrics,
      selectedIds: [...root.gfx.selection.selectedIds],
      layerSequence: root.gfx.layer.layers.map(
        (layer: { type: 'block' | 'canvas' }) => layer.type
      ),
      heapMemory: memory
        ? {
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            totalJSHeapSize: memory.totalJSHeapSize,
            usedJSHeapSize: memory.usedJSHeapSize,
          }
        : null,
    };
  });
}

export async function resetCanvasRendererPerfMetrics(
  page: Page,
  editorIndex = 0
) {
  const container = locateEditorContainer(page, editorIndex);
  await container.evaluate(container => {
    type PerfRenderer = {
      resetDebugMetrics?: () => void;
    };
    const surface = container.querySelector('affine-surface');

    if (!surface) {
      throw new Error('Surface block not found');
    }

    const renderer = surface.renderer as PerfRenderer | undefined;
    if (!renderer || typeof renderer.resetDebugMetrics !== 'function') {
      throw new Error('Canvas renderer debug metrics are unavailable');
    }

    renderer.resetDebugMetrics();
  });
}

export async function seedEdgelessPerfScene(
  page: Page,
  options: SeedEdgelessPerfSceneOptions = {},
  editorIndex = 0
) {
  const container = locateEditorContainer(page, editorIndex);
  return container.evaluate((container, options) => {
    const root = container.querySelector('affine-edgeless-root');

    if (!root) {
      throw new Error('Edgeless root not found');
    }

    const doc = root.service.doc;
    const nextIndex = root.gfx.layer.createIndexGenerator();
    const shapeCount = options.shapeCount ?? 120;
    const noteCount = options.noteCount ?? 0;
    const rowLength = options.rowLength ?? 12;
    const width = options.width ?? 140;
    const height = options.height ?? 100;
    const startX = options.startX ?? 80;
    const startY = options.startY ?? 160;
    const interleaved = options.interleaved ?? false;
    const gapX = width + 36;
    const gapY = height + 36;

    let shapeCursor = 0;
    let noteCursor = 0;
    const shapeIds: string[] = [];
    const noteIds: string[] = [];

    const getPosition = (cursor: number) => {
      const row = Math.floor(cursor / rowLength);
      const col = cursor % rowLength;

      return {
        x: startX + col * gapX,
        y: startY + row * gapY,
      };
    };

    const addShape = () => {
      const { x, y } = getPosition(shapeCursor++);
      const id = root.service.crud.addElement('shape', {
        index: nextIndex(),
        shapeType: 'rect',
        xywh: `[${x}, ${y}, ${width}, ${height}]`,
      });

      if (id) {
        shapeIds.push(id);
      }
    };

    const addNote = () => {
      const { x, y } = getPosition(noteCursor++);
      const noteId = doc.addBlock(
        'affine:note',
        {
          index: nextIndex(),
          xywh: `[${x}, ${y}, ${Math.max(width * 2, 260)}, ${height}]`,
        },
        doc.root
      );

      doc.addBlock('affine:paragraph', {}, noteId);
      noteIds.push(noteId);
    };

    if (interleaved) {
      const maxCount = Math.max(shapeCount, noteCount);

      for (let i = 0; i < maxCount; i++) {
        if (i < noteCount) {
          addNote();
        }
        if (i < shapeCount) {
          addShape();
        }
      }
    } else {
      for (let i = 0; i < shapeCount; i++) {
        addShape();
      }
      for (let i = 0; i < noteCount; i++) {
        addNote();
      }
    }

    return { noteIds, shapeIds };
  }, options);
}

export async function deleteEdgelessElements(
  page: Page,
  ids: string[],
  editorIndex = 0
) {
  const container = locateEditorContainer(page, editorIndex);
  await container.evaluate((container, ids) => {
    const root = container.querySelector('affine-edgeless-root');

    if (!root) {
      throw new Error('Edgeless root not found');
    }

    const doc = root.service.doc;

    ids.forEach(id => {
      const element = root.service.crud.getElementById(id);
      if (element) {
        root.service.removeElement(id);
        return;
      }

      if (doc.getBlock(id)) {
        doc.deleteBlock(id);
      }
    });
  }, ids);
}
