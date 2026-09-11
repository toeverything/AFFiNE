import { describe, expect, it } from 'vitest';

import {
  createElement,
  createEmptyScene,
  decodeSceneBlob,
  encodeSceneBlob,
  isExcalidrawScene,
  parseExcalidrawJson,
  serializeScene,
} from './scene';
import { sceneToSvg } from './svg';

describe('wb:sketch scene', () => {
  it('accepts only Excalidraw documents', () => {
    expect(isExcalidrawScene({ type: 'excalidraw', elements: [] })).toBe(true);
    expect(isExcalidrawScene({ elements: [] })).toBe(false);
    expect(parseExcalidrawJson('not-json').elements).toEqual([]);
  });

  it('round-trips a gzip (or raw) scene blob', async () => {
    const scene = createEmptyScene();
    scene.elements.push(
      createElement('rectangle', { x: 8, y: 8, width: 40, height: 20 })
    );
    const blob = await encodeSceneBlob(scene);
    const loaded = await decodeSceneBlob(blob);
    expect(loaded.elements).toHaveLength(1);
    expect(loaded.elements[0]?.type).toBe('rectangle');
    expect(serializeScene(loaded)).toContain('rectangle');
  });

  it('renders an SVG snapshot without Excalidraw', () => {
    const scene = createEmptyScene();
    scene.elements.push(
      createElement('ellipse', { x: 10, y: 10, width: 30, height: 20 })
    );
    const svg = sceneToSvg(scene);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<ellipse');
  });
});
