import { DomRenderer } from '@blocksuite/affine-block-surface';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { getSurface } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

function expectPxCloseTo(
  value: string,
  expected: number,
  precision: number = 2
) {
  expect(Number.parseFloat(value)).toBeCloseTo(expected, precision);
}

describe('Shape rendering with DOM renderer', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless', [], {
      enableDomRenderer: true,
    });
    return cleanup;
  });

  test('should use DomRenderer when enable_dom_renderer flag is true', async () => {
    const surface = getSurface(doc, editor);
    expect(surface).not.toBeNull();
    expect(surface?.renderer).toBeInstanceOf(DomRenderer);
  });

  test('should render a shape element as a DOM node', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    const shapeProps = {
      type: 'shape',
      subType: 'rectangle',
      xywh: '[150, 150, 80, 60]',
      fill: '#ff0000',
      stroke: '#000000',
    };
    const shapeId = surfaceModel.addElement(shapeProps);

    await new Promise(resolve => setTimeout(resolve, 100));
    const shapeElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${shapeId}"]`
    );

    expect(shapeElement).not.toBeNull();
    expect(shapeElement).toBeInstanceOf(HTMLElement);
  });

  test('should correctly apply percentage-based border radius', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;
    const shapeProps = {
      type: 'shape',
      subType: 'rectangle',
      xywh: '[150, 150, 80, 60]', // width: 80, height: 60
      radius: 0.1, // 10% of min(width, height) = 10% of 60 = 6
      fill: '#ff0000',
      stroke: '#000000',
    };
    const shapeId = surfaceModel.addElement(shapeProps);
    await wait(100);
    const shapeElement = surfaceView?.renderRoot.querySelector<HTMLElement>(
      `[data-element-id="${shapeId}"]`
    );

    expect(shapeElement).not.toBeNull();
    const zoom = surfaceView.renderer.viewport.zoom;
    expectPxCloseTo(shapeElement!.style.borderRadius, 6 * zoom);
  });

  test('should remove shape DOM node when element is deleted', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    expect(surfaceView.renderer).toBeInstanceOf(DomRenderer);

    const shapeProps = {
      type: 'shape',
      subType: 'ellipse',
      xywh: '[200, 200, 50, 50]',
    };
    const shapeId = surfaceModel.addElement(shapeProps);

    await new Promise(resolve => setTimeout(resolve, 100));

    let shapeElement = surfaceView.renderRoot.querySelector(
      `[data-element-id="${shapeId}"]`
    );
    expect(shapeElement).not.toBeNull();

    surfaceModel.deleteElement(shapeId);

    await new Promise(resolve => setTimeout(resolve, 100));

    shapeElement = surfaceView.renderRoot.querySelector(
      `[data-element-id="${shapeId}"]`
    );
    expect(shapeElement).toBeNull();
  });

  test('should correctly render diamond shape', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;
    const shapeProps = {
      type: 'shape',
      subType: 'diamond',
      xywh: '[150, 150, 80, 60]',
      fillColor: '#ff0000',
      strokeColor: '#000000',
      filled: true,
    };
    const shapeId = surfaceModel.addElement(shapeProps);
    await wait(100);
    const shapeElement = surfaceView?.renderRoot.querySelector<HTMLElement>(
      `[data-element-id="${shapeId}"]`
    );

    expect(shapeElement).not.toBeNull();
    const zoom = surfaceView.renderer.viewport.zoom;
    expectPxCloseTo(shapeElement!.style.width, 80 * zoom);
    expectPxCloseTo(shapeElement!.style.height, 60 * zoom);
  });

  test('should correctly render triangle shape', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;
    const shapeProps = {
      type: 'shape',
      subType: 'triangle',
      xywh: '[150, 150, 80, 60]',
      fillColor: '#ff0000',
      strokeColor: '#000000',
      filled: true,
    };
    const shapeId = surfaceModel.addElement(shapeProps);
    await wait(100);
    const shapeElement = surfaceView?.renderRoot.querySelector<HTMLElement>(
      `[data-element-id="${shapeId}"]`
    );

    expect(shapeElement).not.toBeNull();
    const zoom = surfaceView.renderer.viewport.zoom;
    expectPxCloseTo(shapeElement!.style.width, 80 * zoom);
    expectPxCloseTo(shapeElement!.style.height, 60 * zoom);
  });
});
