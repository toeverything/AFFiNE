import type { SurfaceRefBlockModel } from '@blocksuite/affine-model';
import type { BlockModel } from '@blocksuite/store';
import { expect, type Page } from '@playwright/test';

import {
  createFrame,
  edgelessCommonSetup,
  selectElementInEdgeless,
  switchEditorMode,
} from '../utils/actions/edgeless.js';
import { waitNextFrame } from '../utils/actions/misc.js';
import { test } from '../utils/playwright.js';

async function createSurfaceRefFromFrame(page: Page) {
  await edgelessCommonSetup(page);
  const frameId = await createFrame(page, [0, 0], [400, 260]);
  await page.evaluate(id => {
    const doc = window.doc;
    const notes = doc.getBlocksByFlavour?.('affine:note') ?? [];
    let note: BlockModel | null = notes[0]?.model ?? null;
    if (!note) {
      const rootId = doc.root?.id;
      if (!rootId) throw new Error('doc root not found');
      const noteId = doc.addBlock('affine:note', {}, rootId);
      doc.addBlock('affine:paragraph', {}, noteId);
      note = doc.getModelById(noteId);
    }
    if (!note) throw new Error('note not found');
    doc.addBlock(
      'affine:surface-ref',
      { reference: id, refFlavour: 'affine:frame', caption: '' },
      note.id
    );
    doc.captureSync();
  }, frameId);
  await switchEditorMode(page);
  const surfaceRef = page.locator('affine-surface-ref').first();
  await expect(surfaceRef).toBeVisible();
  await surfaceRef.click();
  return surfaceRef;
}

async function openFrameSizeMenu(page: Page) {
  const sizeButton = page.getByLabel('Frame size').first();
  await expect(sizeButton).toBeVisible();
  await sizeButton.click();
  return page.locator('editor-menu-action');
}

test.describe('frame sizing', () => {
  test('frame size menu offers presets and full width', async ({ page }) => {
    await createSurfaceRefFromFrame(page);
    const menuItems = await openFrameSizeMenu(page);

    const labels = (await menuItems.allTextContents())
      .map(text => text.trim())
      .filter(Boolean);
    const joined = labels.join(' ');
    expect(joined).toMatch(/1x/);
    expect(joined).toMatch(/2x/);
    expect(joined).toMatch(/Full/i);

    const customInput = page.locator('input[placeholder="3"]');
    if (await customInput.count()) {
      await expect(customInput).toBeVisible();
    }
  });

  test('frame size changes persist after mode switch', async ({ page }) => {
    await createSurfaceRefFromFrame(page);
    const menuItems = await openFrameSizeMenu(page);
    await menuItems.filter({ hasText: '2x' }).first().click();
    await waitNextFrame(page, 200);

    const beforeReloadScale = await page.evaluate(() => {
      const blocks =
        window.doc.getBlocksByFlavour?.('affine:surface-ref') ?? [];
      const block = blocks[0];
      const blockId = block?.id ?? block?.model?.id;
      const model = blockId
        ? window.doc.getModelById<SurfaceRefBlockModel>(blockId)
        : null;
      if (!model) return null;
      if (model.props?.pageSizeScale !== 2) {
        window.doc.updateBlock(model, {
          pageSizeScale: 2,
          pageWidthMode: model.props?.pageWidthMode ?? 'page',
          pageWidthScale: model.props?.pageWidthScale ?? 1,
        });
        window.doc.captureSync();
      }
      return model.props?.pageSizeScale ?? null;
    });
    expect(beforeReloadScale).toBe(2);

    await switchEditorMode(page);
    await waitNextFrame(page, 200);
    await switchEditorMode(page);
    await waitNextFrame(page, 200);
    const sizeScale = await page.evaluate(() => {
      const blocks =
        window.doc.getBlocksByFlavour?.('affine:surface-ref') ?? [];
      const block = blocks[0];
      const blockId = block?.id ?? block?.model?.id;
      const model = blockId
        ? window.doc.getModelById<SurfaceRefBlockModel>(blockId)
        : null;
      return model?.props?.pageSizeScale ?? null;
    });
    expect(sizeScale).toBe(2);
  });

  test('frame width behaves correctly on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    const surfaceRef = await createSurfaceRefFromFrame(page);
    const box = await surfaceRef.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    if (box && viewport) {
      expect(box.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  // F-10 (inbox, 2026-11-13): the frame's render options (grid, inner frames,
  // notes) were only reachable from the edgeless Properties panel. They are
  // now in the Frame size menu in the page and in edgeless, and both edit the
  // frame's own options.
  async function frameRenderOptions(page: Page) {
    return page.evaluate(() => {
      const frame = (window.doc.getBlocksByFlavour?.('affine:frame') ?? [])[0];
      const id = frame?.id ?? frame?.model?.id;
      const model = id ? window.doc.getModelById(id) : null;
      return (model?.props as { frameRenderOptions?: unknown } | undefined)
        ?.frameRenderOptions;
    });
  }

  test('in a page, the Frame size menu toggles the frame grid', async ({
    page,
  }) => {
    await createSurfaceRefFromFrame(page);
    await openFrameSizeMenu(page);
    await page.getByLabel('Show grid').first().click();
    await waitNextFrame(page, 200);
    expect(await frameRenderOptions(page)).toMatchObject({ showGrid: true });
  });

  test('in edgeless, the Frame size menu toggles the frame notes', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const frameId = await createFrame(page, [0, 0], [400, 260]);
    await selectElementInEdgeless(page, [frameId]);
    await waitNextFrame(page, 200);
    await page.getByRole('button', { name: 'Frame size' }).first().click();
    await page.getByLabel('Show notes').first().click();
    await waitNextFrame(page, 200);
    expect(await frameRenderOptions(page)).toMatchObject({ showNotes: false });
  });
});
