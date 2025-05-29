import { DomRenderer } from '@blocksuite/affine-block-surface';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { getSurface } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

/**
 * Tests for brush element rendering with DOM renderer.
 * These tests verify that brush elements are correctly rendered as DOM nodes
 * when the DOM renderer is enabled, similar to connector element tests.
 */

describe('Brush rendering with DOM renderer', () => {
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

  test('should render a brush element as a DOM node', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    // Create a brush element with points (commands will be auto-generated)
    const brushProps = {
      type: 'brush',
      points: [
        [10, 10],
        [50, 50],
        [100, 20],
      ],
      color: '#000000',
      lineWidth: 2,
    };
    const brushId = surfaceModel.addElement(brushProps);

    await wait(100);

    const brushElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${brushId}"]`
    );

    expect(brushElement).not.toBeNull();
    expect(brushElement).toBeInstanceOf(HTMLElement);

    // Check if SVG element is present for brush rendering
    const svgElement = brushElement?.querySelector('svg');
    expect(svgElement).not.toBeNull();

    // Check if path element is present
    const pathElement = svgElement?.querySelector('path');
    expect(pathElement).not.toBeNull();
    // Commands are auto-generated from points, so just check it exists
    expect(pathElement?.getAttribute('d')).toBeTruthy();
  });

  test('should render brush with different colors', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    // Create a red brush element
    const brushProps = {
      type: 'brush',
      points: [
        [20, 20],
        [35, 15],
        [50, 25],
        [65, 45],
        [80, 80],
      ],
      color: '#ff0000',
      lineWidth: 3,
    };
    const brushId = surfaceModel.addElement(brushProps);

    await wait(100);

    const brushElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${brushId}"]`
    );

    expect(brushElement).not.toBeNull();

    const svgElement = brushElement?.querySelector('svg');
    expect(svgElement).not.toBeNull();

    const pathElement = svgElement?.querySelector('path');
    expect(pathElement).not.toBeNull();

    // Check if color is applied (the actual color value might be processed)
    const fillColor = pathElement?.getAttribute('fill');
    expect(fillColor).toBeTruthy();
  });

  test('should render brush with opacity', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    const brushProps = {
      type: 'brush',
      points: [
        [10, 10],
        [50, 50],
        [90, 90],
      ],
      color: '#0000ff',
      lineWidth: 2,
    };
    const brushId = surfaceModel.addElement(brushProps);

    // Set opacity after creation through model update
    const brushModel = surfaceModel.getElementById(brushId);
    if (brushModel) {
      surfaceModel.updateElement(brushId, { opacity: 0.5 });
    }

    await wait(100);

    const brushElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${brushId}"]`
    );

    expect(brushElement).not.toBeNull();

    // Check opacity style
    const opacity = (brushElement as HTMLElement)?.style.opacity;
    expect(opacity).toBe('0.5');
  });

  test('should render brush with rotation', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    const brushProps = {
      type: 'brush',
      points: [
        [25, 25],
        [50, 50],
        [75, 75],
      ],
      color: '#00ff00',
      lineWidth: 2,
      rotate: 45,
    };
    const brushId = surfaceModel.addElement(brushProps);

    await wait(100);

    const brushElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${brushId}"]`
    );

    expect(brushElement).not.toBeNull();

    // Check rotation transform
    const transform = (brushElement as HTMLElement)?.style.transform;
    expect(transform).toContain('rotate(45deg)');

    const transformOrigin = (brushElement as HTMLElement)?.style
      .transformOrigin;
    expect(transformOrigin).toBe('center center');
  });

  test('should have proper SVG viewport and sizing', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    const brushProps = {
      type: 'brush',
      points: [
        [0, 0],
        [60, 40],
        [120, 80],
      ],
      color: '#333333',
      lineWidth: 2,
    };
    const brushId = surfaceModel.addElement(brushProps);

    await wait(100);

    const brushElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${brushId}"]`
    );

    expect(brushElement).not.toBeNull();

    const svgElement = brushElement?.querySelector('svg');
    expect(svgElement).not.toBeNull();

    // Check SVG attributes
    expect(svgElement?.getAttribute('width')).toBe('100%');
    expect(svgElement?.getAttribute('height')).toBe('100%');
    expect(svgElement?.getAttribute('viewBox')).toBeTruthy();
    expect(svgElement?.getAttribute('preserveAspectRatio')).toBe('none');
  });

  test('should add brush-specific CSS class', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    const brushProps = {
      type: 'brush',
      points: [
        [10, 10],
        [25, 25],
        [40, 40],
      ],
      color: '#666666',
      lineWidth: 2,
    };
    const brushId = surfaceModel.addElement(brushProps);

    await wait(100);

    const brushElement = surfaceView?.renderRoot.querySelector(
      `[data-element-id="${brushId}"]`
    );

    expect(brushElement).not.toBeNull();
    expect(brushElement?.classList.contains('brush-element')).toBe(true);
  });

  test('should remove brush DOM node when element is deleted', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    expect(surfaceView.renderer).toBeInstanceOf(DomRenderer);

    const brushProps = {
      type: 'brush',
      points: [
        [25, 25],
        [75, 25],
        [75, 75],
        [25, 75],
        [25, 25],
      ],
      color: '#aa00aa',
      lineWidth: 2,
    };
    const brushId = surfaceModel.addElement(brushProps);

    await wait(100);

    let brushElement = surfaceView.renderRoot.querySelector(
      `[data-element-id="${brushId}"]`
    );
    expect(brushElement).not.toBeNull();

    surfaceModel.deleteElement(brushId);

    await wait(100);

    brushElement = surfaceView.renderRoot.querySelector(
      `[data-element-id="${brushId}"]`
    );
    expect(brushElement).toBeNull();
  });
});
