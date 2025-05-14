import { DomRenderer } from '@blocksuite/affine-block-surface';
import { beforeEach, describe, expect, test } from 'vitest';

import { getSurface } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

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
    const shapeId = surfaceModel.addElement(shapeProps as any);

    await new Promise(resolve => setTimeout(resolve, 100));
    const shapeElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${shapeId}"]`
    );

    expect(shapeElement).not.toBeNull();
    expect(shapeElement).toBeInstanceOf(HTMLElement);
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
    const shapeId = surfaceModel.addElement(shapeProps as any);

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
});
