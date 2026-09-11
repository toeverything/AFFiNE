import type { MiroCsvRow } from '../../infra/formats/miro-csv';
import type { WhiteboardImport } from '../../infra/import';
import { createElement, isExcalidrawScene, normalizeScene } from './scene';
import type { SketchElement, SketchScene } from './types';

const IMPORT_GRID = { width: 160, height: 90, gap: 24, columns: 4 };

type ImportedShape = {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function excalidrawScene(json: string): SketchScene | undefined {
  try {
    const parsed: unknown = JSON.parse(json);
    return isExcalidrawScene(parsed) ? normalizeScene(parsed) : undefined;
  } catch {
    return undefined;
  }
}

function miroShapes(rows: MiroCsvRow[]): ImportedShape[] {
  return rows.map((row, index) => ({
    label: row.title,
    x:
      row.x ??
      (index % IMPORT_GRID.columns) * (IMPORT_GRID.width + IMPORT_GRID.gap),
    y:
      row.y ??
      Math.floor(index / IMPORT_GRID.columns) *
        (IMPORT_GRID.height + IMPORT_GRID.gap),
    w: row.w ?? IMPORT_GRID.width,
    h: row.h ?? IMPORT_GRID.height,
  }));
}

function shapeToElements(shape: ImportedShape): SketchElement[] {
  const frame = createElement('rectangle', {
    x: shape.x,
    y: shape.y,
    width: shape.w,
    height: shape.h,
  });
  if (!shape.label) return [frame];
  return [
    frame,
    createElement(
      'text',
      {
        x: shape.x + 8,
        y: shape.y + 8,
        width: Math.max(24, shape.w - 16),
        height: 20,
      },
      { text: shape.label, fontSize: 16 }
    ),
  ];
}

/** `.excalidraw` replaces the scene; shape formats are appended to it. */
export function sketchSceneFromImport(
  payload: WhiteboardImport,
  base: SketchScene
): SketchScene | undefined {
  if (payload.format === 'excalidraw') return excalidrawScene(payload.json);
  const shapes =
    payload.format === 'drawio' ? payload.shapes : miroShapes(payload.rows);
  if (!shapes.length) return;
  return {
    ...base,
    elements: [...base.elements, ...shapes.flatMap(shapeToElements)],
  };
}
