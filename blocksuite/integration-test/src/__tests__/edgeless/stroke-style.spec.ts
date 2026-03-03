import type { ShapeElementModel } from '@blocksuite/affine-model';
import { ShapeType, StrokeStyle } from '@blocksuite/affine-model';
import { beforeEach, describe, expect, test } from 'vitest';

import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('stroke style', () => {
  let service!: ReturnType<typeof getDocRootBlock>['service'];

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    service = getDocRootBlock(doc, editor, 'edgeless').service;
    return cleanup;
  });

  test('dot stroke style is persisted for shapes', () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: ShapeType.Rect,
      strokeStyle: StrokeStyle.Dot,
    });
    if (!shapeId) throw new Error('shapeId is not found');
    const shape = service.crud.getElementById(shapeId) as ShapeElementModel;

    expect(shape.strokeStyle).toBe(StrokeStyle.Dot);
    expect(shape.serialize().strokeStyle).toBe(StrokeStyle.Dot);
  });
});
