import type { ShapeElementModel } from '@blocksuite/affine-model';
import { ShapeType } from '@blocksuite/affine-model';
import { beforeEach, describe, expect, test } from 'vitest';

import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('gradient fill', () => {
  let service!: ReturnType<typeof getDocRootBlock>['service'];

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    service = getDocRootBlock(doc, editor, 'edgeless').service;
    return cleanup;
  });

  test('gradient props are serialized on shapes', () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: ShapeType.Rect,
      gradientFinal: '#ff9900',
      gradientDirection: 'NE',
    });
    if (!shapeId) throw new Error('shapeId is not found');
    const shape = service.crud.getElementById(shapeId) as ShapeElementModel;

    const serialized = shape.serialize();
    expect(serialized.gradientFinal).toBe('#ff9900');
    expect(serialized.gradientDirection).toBe('NE');
  });
});
