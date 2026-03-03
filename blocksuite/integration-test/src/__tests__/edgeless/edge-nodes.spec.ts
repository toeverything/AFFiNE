import type { ShapeElementModel } from '@blocksuite/affine-model';
import { ShapeType } from '@blocksuite/affine-model';
import { beforeEach, describe, expect, test } from 'vitest';

import {
  ConnectorEndpointLocationsOnCloud,
  ConnectorEndpointLocationsOnDiamond,
  ConnectorEndpointLocationsOnRectangle,
  getAnchors,
} from '../../../../affine/gfx/connector/src/connector-manager.js';
import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('edge nodes', () => {
  let service!: ReturnType<typeof getDocRootBlock>['service'];

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    service = getDocRootBlock(doc, editor, 'edgeless').service;
    return cleanup;
  });

  const hasAnchor = (
    anchors: ReturnType<typeof getAnchors>,
    coord: [number, number]
  ) =>
    anchors.some(
      anchor =>
        Math.abs(anchor.coord[0] - coord[0]) < 1e-6 &&
        Math.abs(anchor.coord[1] - coord[1]) < 1e-6
    );

  test('rectangle anchors include extended connection points', () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: ShapeType.Rect,
      xywh: JSON.stringify([0, 0, 200, 120]),
    });
    if (!shapeId) throw new Error('shapeId is not found');
    const shape = service.crud.getElementById(shapeId) as ShapeElementModel;

    const anchors = getAnchors(shape);
    expect(anchors).toHaveLength(ConnectorEndpointLocationsOnRectangle.length);
    ConnectorEndpointLocationsOnRectangle.forEach(location => {
      expect(hasAnchor(anchors, [location[0], location[1]])).toBe(true);
    });
  });

  test('diamond anchors include extended connection points', () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: ShapeType.Diamond,
      xywh: JSON.stringify([0, 0, 200, 120]),
    });
    if (!shapeId) throw new Error('shapeId is not found');
    const shape = service.crud.getElementById(shapeId) as ShapeElementModel;

    const anchors = getAnchors(shape);
    expect(anchors).toHaveLength(ConnectorEndpointLocationsOnDiamond.length);
    ConnectorEndpointLocationsOnDiamond.forEach(location => {
      expect(hasAnchor(anchors, [location[0], location[1]])).toBe(true);
    });
  });

  test('cloud anchors follow cloud geometry locations', () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: ShapeType.Cloud,
      xywh: JSON.stringify([0, 0, 200, 120]),
    });
    if (!shapeId) throw new Error('shapeId is not found');
    const shape = service.crud.getElementById(shapeId) as ShapeElementModel;

    const anchors = getAnchors(shape);
    expect(anchors.length).toBeGreaterThanOrEqual(6);
    const coords = anchors.map(anchor => anchor.coord);
    coords.forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    });
  });
});
