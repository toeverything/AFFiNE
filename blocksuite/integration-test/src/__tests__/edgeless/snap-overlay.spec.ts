import { Bound } from '@blocksuite/global/gfx';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { beforeEach, describe, expect, test } from 'vitest';

import { SnapOverlay } from '../../../../affine/gfx/pointer/src/snap/snap-overlay.js';
import { wait } from '../utils/common.js';
import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('snap overlay', () => {
  let overlay!: SnapOverlay;

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    const edgelessRoot = getDocRootBlock(doc, editor, 'edgeless');
    const gfx = edgelessRoot.std.get(GfxControllerIdentifier);
    overlay = new SnapOverlay(gfx);
    return cleanup;
  });

  test('no snapping when both grid and guides disabled', () => {
    overlay.setEnabled(false);
    overlay.setSnapToGrid(false);
    overlay.setGridSize(10);

    const result = overlay.align(new Bound(9, 0, 10, 10));
    expect(result).toEqual({ dx: 0, dy: 0 });
  });

  test('snap-to-grid adjusts bounds when enabled', () => {
    overlay.setEnabled(false);
    overlay.setSnapToGrid(true);
    overlay.setGridSize(10);

    const result = overlay.align(new Bound(9, 0, 10, 10));
    expect(Math.abs(result.dx)).toBeGreaterThan(0);
    expect(Math.abs(result.dx)).toBeLessThanOrEqual(8);
  });

  test('snap-to-guides aligns to nearby elements when enabled', async () => {
    const edgelessRoot = getDocRootBlock(doc, editor, 'edgeless');
    const elementId = edgelessRoot.service.crud.addElement('shape', {
      shapeType: 'rect',
      xywh: JSON.stringify([100, 0, 100, 100]),
    });
    if (!elementId) {
      throw new Error('elementId is not found');
    }
    await wait();

    overlay.setEnabled(true);
    overlay.setSnapToGrid(false);

    const result = overlay.align(new Bound(108, 0, 100, 100));
    expect(Math.abs(result.dx)).toBeGreaterThan(0);
    expect(Math.abs(result.dx)).toBeLessThanOrEqual(8);
  });
});
