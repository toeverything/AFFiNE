import { DomRenderer } from '@blocksuite/affine-block-surface';
import { Bound } from '@blocksuite/global/gfx';
import { beforeEach, describe, expect, test } from 'vitest';

import { drawioLibraryCatalog } from '../../../../affine/gfx/shape/src/drawio/library-catalog.js';
import {
  ExtendedShapeConfig,
  ShapeComponentConfig,
} from '../../../../affine/gfx/shape/src/toolbar/shape-menu-config.js';
import { wait } from '../utils/common.js';
import { getSurface } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

type ShapeSpec = {
  subType: string;
  stencilName?: string;
  label: string;
};

function getAllKnownShapeSpecs(): ShapeSpec[] {
  const configShapes = [...ShapeComponentConfig, ...ExtendedShapeConfig].map(
    (item): ShapeSpec => ({
      subType: item.name,
      label: item.tooltip,
    })
  );

  const drawioShapes = drawioLibraryCatalog.map(item => ({
    subType: 'drawioStencil',
    stencilName: item.stencilName,
    label: item.label,
  }));

  const deduped = new Map<string, ShapeSpec>();
  [...configShapes, ...drawioShapes].forEach(item => {
    const key = `${item.subType}:${item.stencilName ?? ''}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  });

  return [...deduped.values()];
}

function getShapeTextElement(root: ParentNode, id: string) {
  const shapeRoot = root.querySelector(`[data-element-id="${id}"]`);
  if (!shapeRoot) {
    return null;
  }

  const roleText = shapeRoot.querySelector<HTMLElement>(
    '[data-role="shape-text"]'
  );
  if (roleText) {
    return roleText;
  }

  return [...shapeRoot.querySelectorAll<HTMLElement>('div')].find(
    element => element.style.whiteSpace === 'pre-wrap'
  );
}

async function expectTextNotMirrored(
  surfaceView: ReturnType<typeof getSurface>,
  surfaceModel: ReturnType<typeof getSurface>['model'],
  root: ParentNode,
  ids: string[],
  axis: 'X' | 'Y',
  idToSpec?: Map<string, ShapeSpec>
) {
  const mirroredPattern = axis === 'X' ? /scale\(\s*-1\s*,/ : /,\s*-1\s*\)/;

  for (const id of ids) {
    const model = surfaceModel.getElementById(id);
    if (model) {
      surfaceView.fitToViewport(Bound.from(model));
      await wait(60);
    }
    let shapeRoot = root.querySelector(`[data-element-id="${id}"]`);
    for (let i = 0; i < 3 && !shapeRoot; i += 1) {
      await wait(60);
      shapeRoot = root.querySelector(`[data-element-id="${id}"]`);
    }
    const spec = idToSpec?.get(id);
    const specLabel = spec
      ? `${spec.label} (${spec.subType}${spec.stencilName ? `:${spec.stencilName}` : ''})`
      : id;
    const textElement = getShapeTextElement(root, id);
    if (!textElement) {
      const snippet = shapeRoot
        ? shapeRoot.outerHTML.slice(0, 200)
        : 'shape root not found';
      expect(
        textElement,
        `Missing text element for shape ${specLabel}. Root: ${snippet}`
      ).not.toBeNull();
    }
    const transform = textElement?.style.transform ?? '';
    expect(transform).not.toMatch(mirroredPattern);
  }
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
    expect(shapeElement?.style.borderRadius).toBe('6px');
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
    expect(shapeElement?.style.width).toBe('80px');
    expect(shapeElement?.style.height).toBe('60px');
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
    expect(shapeElement?.style.width).toBe('80px');
    expect(shapeElement?.style.height).toBe('60px');
  });

  test('horizontal flip keeps text direction for all known shapes', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;
    const specs = getAllKnownShapeSpecs();
    const ids: string[] = [];
    const idToSpec = new Map<string, ShapeSpec>();
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    specs.forEach((spec, index) => {
      const col = index % 12;
      const row = Math.floor(index / 12);
      const x = 80 + col * 120;
      const y = 80 + row * 100;

      const id = surfaceModel.addElement({
        type: 'shape',
        subType: spec.subType,
        stencilName: spec.stencilName,
        xywh: `[${x}, ${y}, 100, 72]`,
        text: `H${index}`,
        textDisplay: true,
      });
      ids.push(id);
      idToSpec.set(id, spec);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 100);
      maxY = Math.max(maxY, y + 72);
    });

    surfaceView.fitToViewport(new Bound(minX, minY, maxX - minX, maxY - minY));

    await wait(120);

    ids.forEach(id => {
      surfaceModel.updateElement(id, {
        flipX: true,
      });
    });

    await wait(120);
    await expectTextNotMirrored(
      surfaceView,
      surfaceModel,
      surfaceView.renderRoot,
      ids,
      'X',
      idToSpec
    );
  });

  test('vertical flip keeps text direction for all known shapes', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;
    const specs = getAllKnownShapeSpecs();
    const ids: string[] = [];
    const idToSpec = new Map<string, ShapeSpec>();
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    specs.forEach((spec, index) => {
      const col = index % 12;
      const row = Math.floor(index / 12);
      const x = 80 + col * 120;
      const y = 80 + row * 100;

      const id = surfaceModel.addElement({
        type: 'shape',
        subType: spec.subType,
        stencilName: spec.stencilName,
        xywh: `[${x}, ${y}, 100, 72]`,
        text: `V${index}`,
        textDisplay: true,
      });
      ids.push(id);
      idToSpec.set(id, spec);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 100);
      maxY = Math.max(maxY, y + 72);
    });

    surfaceView.fitToViewport(new Bound(minX, minY, maxX - minX, maxY - minY));

    await wait(120);

    ids.forEach(id => {
      surfaceModel.updateElement(id, {
        flipY: true,
      });
    });

    await wait(120);
    await expectTextNotMirrored(
      surfaceView,
      surfaceModel,
      surfaceView.renderRoot,
      ids,
      'Y',
      idToSpec
    );
  });
});
