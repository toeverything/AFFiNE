import { describe, expect, it } from 'vitest';

import { sketchSceneFromImport } from './import';
import { createElement, createEmptyScene } from './scene';

describe('sketch import dispatch', () => {
  it('replaces the scene from an .excalidraw payload', () => {
    const base = createEmptyScene();
    const scene = sketchSceneFromImport(
      {
        format: 'excalidraw',
        json: JSON.stringify({
          type: 'excalidraw',
          elements: [
            createElement('ellipse', { x: 0, y: 0, width: 10, height: 10 }),
          ],
        }),
      },
      base
    );
    expect(scene?.elements).toHaveLength(1);
    expect(
      sketchSceneFromImport({ format: 'excalidraw', json: '{"a":1}' }, base)
    ).toBeUndefined();
    expect(
      sketchSceneFromImport({ format: 'excalidraw', json: 'nope' }, base)
    ).toBeUndefined();
  });

  it('appends draw.io shapes and Miro rows to the current scene', () => {
    const base = createEmptyScene();
    base.elements.push(
      createElement('rectangle', { x: 0, y: 0, width: 10, height: 10 })
    );

    const drawio = sketchSceneFromImport(
      {
        format: 'drawio',
        shapes: [{ id: '1', label: 'Box', x: 10, y: 20, w: 80, h: 40 }],
      },
      base
    );
    expect(drawio?.elements).toHaveLength(3);
    expect(drawio?.elements[2]?.text).toBe('Box');

    const miro = sketchSceneFromImport(
      { format: 'miro-csv', rows: [{ title: 'Sticky' }, { title: 'Other' }] },
      base
    );
    expect(miro?.elements).toHaveLength(5);
    expect(miro?.elements[1]?.x).toBe(0);
    expect(miro?.elements[3]?.x).toBe(184);

    expect(
      sketchSceneFromImport({ format: 'miro-csv', rows: [] }, base)
    ).toBeUndefined();
  });
});
