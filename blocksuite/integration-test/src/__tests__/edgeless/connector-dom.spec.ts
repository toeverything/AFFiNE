import { DomRenderer } from '@blocksuite/affine-block-surface';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { getSurface } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('Connector rendering with DOM renderer', () => {
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

  test('should render a connector element as a DOM node', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    // Create two shapes to connect
    const shape1Id = surfaceModel.addElement({
      type: 'shape',
      xywh: '[100, 100, 80, 60]',
    });

    const shape2Id = surfaceModel.addElement({
      type: 'shape',
      xywh: '[300, 200, 80, 60]',
    });

    // Create a connector between the shapes
    const connectorProps = {
      type: 'connector',
      source: { id: shape1Id },
      target: { id: shape2Id },
      stroke: '#000000',
      strokeWidth: 2,
    };
    const connectorId = surfaceModel.addElement(connectorProps);

    await wait(100);

    const connectorElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${connectorId}"]`
    );

    expect(connectorElement).not.toBeNull();
    expect(connectorElement).toBeInstanceOf(HTMLElement);

    // Check if SVG element is present for connector rendering
    const svgElement = connectorElement?.querySelector('svg');
    expect(svgElement).not.toBeNull();
  });

  test('should render connector with different stroke styles', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    // Create a dashed connector
    const connectorProps = {
      type: 'connector',
      source: { position: [100, 100] },
      target: { position: [200, 200] },
      strokeStyle: 'dash',
      stroke: '#ff0000',
      strokeWidth: 4,
    };
    const connectorId = surfaceModel.addElement(connectorProps);

    // Wait for path generation and rendering
    await wait(500);

    const connectorElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${connectorId}"]`
    );

    expect(connectorElement).not.toBeNull();

    const svgElement = connectorElement?.querySelector('svg');
    expect(svgElement).not.toBeNull();

    // Find the main path element (not the ones inside markers)
    const pathElements = svgElement?.querySelectorAll('path');
    // The main connector path should be the last one (after marker paths)
    const pathElement = pathElements?.[pathElements.length - 1];

    expect(pathElement).not.toBeNull();

    // Check stroke-dasharray attribute
    const strokeDasharray = pathElement!.getAttribute('stroke-dasharray');
    expect(strokeDasharray).toBe('12,12');
  });

  test('should render connector with arrow endpoints', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    const connectorProps = {
      type: 'connector',
      source: { position: [100, 100] },
      target: { position: [200, 200] },
      frontEndpointStyle: 'Triangle',
      rearEndpointStyle: 'Arrow',
    };
    const connectorId = surfaceModel.addElement(connectorProps);

    await wait(100);

    const connectorElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${connectorId}"]`
    );

    expect(connectorElement).not.toBeNull();

    // Check for markers in defs
    const defsElement = connectorElement?.querySelector('defs');
    expect(defsElement).not.toBeNull();

    const markers = defsElement?.querySelectorAll('marker');
    expect(markers?.length).toBeGreaterThan(0);
  });

  test('should remove connector DOM node when element is deleted', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    expect(surfaceView.renderer).toBeInstanceOf(DomRenderer);

    const connectorProps = {
      type: 'connector',
      source: { position: [50, 50] },
      target: { position: [150, 150] },
    };
    const connectorId = surfaceModel.addElement(connectorProps);

    await wait(100);

    let connectorElement = surfaceView.renderRoot.querySelector(
      `[data-element-id="${connectorId}"]`
    );
    expect(connectorElement).not.toBeNull();

    surfaceModel.deleteElement(connectorId);

    await wait(100);

    connectorElement = surfaceView.renderRoot.querySelector(
      `[data-element-id="${connectorId}"]`
    );
    expect(connectorElement).toBeNull();
  });
});
