import type {
  ConnectorElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';
import { ShapeType, StrokeStyle } from '@blocksuite/affine-model';
import { deserializeXYWH, serializeXYWH } from '@blocksuite/global/gfx';
import { beforeEach, describe, expect, test } from 'vitest';

import { PropertiesModal } from '../../../../affine/blocks/root/src/edgeless/configs/toolbar/properties-modal.js';
import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('properties panel', () => {
  let service!: ReturnType<typeof getDocRootBlock>['service'];

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    service = getDocRootBlock(doc, editor, 'edgeless').service;
    return cleanup;
  });

  async function mountModal(model: ShapeElementModel | ConnectorElementModel) {
    const modal = new PropertiesModal();
    modal.host = editor.host;
    modal.model = model;
    modal.referenceElement = document.body;
    document.body.append(modal);
    await modal.updateComplete;
    return modal;
  }

  test('shape color, stroke, and line style updates', async () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: ShapeType.Rect,
    });
    if (!shapeId) throw new Error('shapeId is not found');
    const shape = service.crud.getElementById(shapeId) as ShapeElementModel;

    const modal = await mountModal(shape);
    (modal as any)._updateProperty('fillColor', '#ff0000');
    (modal as any)._updateProperty('strokeColor', '#00ff00');
    (modal as any)._updateProperty('strokeStyle', StrokeStyle.Dot);

    expect(shape.fillColor).toBe('#ff0000');
    expect(shape.filled).toBe(true);
    expect(shape.strokeColor).toBe('#00ff00');
    expect(shape.strokeStyle).toBe(StrokeStyle.Dot);

    modal.remove();
  });

  test('shape size and position edits update xywh', async () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: ShapeType.Rect,
    });
    if (!shapeId) throw new Error('shapeId is not found');
    const shape = service.crud.getElementById(shapeId) as ShapeElementModel;

    const modal = await mountModal(shape);
    (modal as any)._updateProperty('xywh', serializeXYWH(120, 140, 200, 180));

    const [x, y, w, h] = deserializeXYWH(shape.xywh);
    expect([x, y, w, h]).toEqual([120, 140, 200, 180]);

    modal.remove();
  });

  test('corner radius is clamped to valid range', async () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: ShapeType.Rect,
      radius: 0.2,
    });
    if (!shapeId) throw new Error('shapeId is not found');
    const shape = service.crud.getElementById(shapeId) as ShapeElementModel;

    const modal = await mountModal(shape);
    (modal as any)._updateProperty('radius', 2);
    expect(shape.radius).toBe(1);

    (modal as any)._updateProperty('radius', -1);
    expect(shape.radius).toBe(0);

    modal.remove();
  });
});
