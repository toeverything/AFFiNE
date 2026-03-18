import { expect, type Page } from '@playwright/test';

import {
  edgelessCommonSetup,
  setEdgelessTool,
} from '../utils/actions/edgeless.js';
import { test } from '../utils/playwright.js';

async function openShapeBrowser(page: Page) {
  await setEdgelessTool(page, 'shape');
  const shapeMenu = page.locator('edgeless-shape-menu');
  await expect(shapeMenu).toBeVisible();
  const moreButton = shapeMenu.locator('.more-shapes-button');
  await expect(moreButton).toBeVisible();
  await moreButton.click();
  const browserPanel = page.locator('edgeless-shape-browser-panel');
  await expect(browserPanel).toBeVisible();
  return browserPanel;
}

async function createFlowchartShape(
  page: Page,
  xywh: [number, number, number, number],
  props: { fillColor?: string; strokeColor?: string; strokeWidth?: number } = {}
) {
  return page.evaluate(
    ({ xywh, props }) => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      return root.service.crud.addElement('shape', {
        shapeType: 'flowchartProcess',
        xywh: JSON.stringify(xywh),
        radius: 0,
        filled: true,
        ...props,
      });
    },
    { xywh, props }
  );
}

async function getShapeIds(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    return root.service.crud.getElementsByType('shape').map((el: any) => el.id);
  });
}

async function getShapeProps(page: Page, id: string) {
  return page.evaluate(shapeId => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const model = root.service.crud.getElementById(shapeId);
    if (!model) throw new Error('shape not found');
    return {
      fillColor: model.fillColor,
      strokeColor: model.strokeColor,
      strokeWidth: model.strokeWidth,
    };
  }, id);
}

async function openFlowchartQuickAdd(page: Page) {
  const button = page
    .locator('.edgeless-auto-complete-arrow-wrapper.flowchart')
    .locator('.edgeless-auto-complete-arrow')
    .first();
  await expect(button).toBeVisible();
  await button.click();
  const panel = page.locator('.flowchart-panel');
  await expect(panel).toBeVisible();
  return panel;
}

async function pressAndRelease(
  page: Page,
  locator: ReturnType<Page['locator']>
) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('target not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(16);
  await page.mouse.up();
}

test.describe('flowchart and arrow shapes', () => {
  test('flowchart shape palette includes expected shapes', async ({ page }) => {
    await edgelessCommonSetup(page);
    const panel = await openShapeBrowser(page);

    const flowchartCategory = panel.locator('.category-entry', {
      hasText: 'Flowchart',
    });
    await flowchartCategory.click();

    await expect(
      panel.locator('.shape-name', { hasText: 'Process' }).first()
    ).toBeVisible();
    await expect(
      panel.locator('.shape-name', { hasText: 'Decision' }).first()
    ).toBeVisible();
    await expect(
      panel.locator('.shape-name', { hasText: 'Data' }).first()
    ).toBeVisible();
  });

  test('arrow shapes appear under the Arrow category', async ({ page }) => {
    await edgelessCommonSetup(page);
    const panel = await openShapeBrowser(page);

    const arrowCategory = panel.locator('.category-entry', {
      hasText: 'Arrows',
    });
    await arrowCategory.click();

    await expect(
      panel.locator('.shape-name', { hasText: 'Arrow up' }).first()
    ).toBeVisible();
    await expect(
      panel.locator('.shape-name', { hasText: 'Arrow right' }).first()
    ).toBeVisible();
  });

  test('flowchart quick-add creates next shape', async ({ page }) => {
    await edgelessCommonSetup(page);

    const shapeId = await createFlowchartShape(page, [100, 100, 140, 90]);
    await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      root.service.selection.set({ elements: [id] });
    }, shapeId);

    const beforeIds = await getShapeIds(page);
    const panel = await openFlowchartQuickAdd(page);
    await panel.locator('.flowchart-item').first().click();

    const afterIds = await getShapeIds(page);
    expect(afterIds.length).toBe(beforeIds.length + 1);
  });

  test('next flowchart shape inherits styling', async ({ page }) => {
    await edgelessCommonSetup(page);

    const baseId = await createFlowchartShape(page, [120, 240, 140, 90], {
      fillColor: '#22aa55',
      strokeColor: '#ff5500',
      strokeWidth: 6,
    });
    await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      root.service.selection.set({ elements: [id] });
    }, baseId);

    const panel = await openFlowchartQuickAdd(page);
    await panel.locator('.flowchart-item').first().click();

    const ids = await getShapeIds(page);
    const newId = ids.find(id => id !== baseId);
    expect(newId).toBeTruthy();

    const baseProps = await getShapeProps(page, baseId);
    const newProps = await getShapeProps(page, newId!);
    expect(newProps.fillColor).toBe(baseProps.fillColor);
    expect(newProps.strokeColor).toBe(baseProps.strokeColor);
    expect(newProps.strokeWidth).toBe(baseProps.strokeWidth);
  });

  test('flowchart tap adds next shape without random selection', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    const shapeId = await createFlowchartShape(page, [160, 120, 140, 90]);
    await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      root.service.selection.set({ elements: [id] });
    }, shapeId);

    const beforeIds = await getShapeIds(page);
    const button = page
      .locator('.edgeless-auto-complete-arrow-wrapper.flowchart')
      .locator('.edgeless-auto-complete-arrow')
      .first();
    await expect(button).toBeVisible();
    await pressAndRelease(page, button);
    const panel = page.locator('.flowchart-panel');
    await expect(panel).toBeVisible();
    await pressAndRelease(page, panel.locator('.flowchart-item').first());

    const afterIds = await getShapeIds(page);
    expect(afterIds.length).toBeGreaterThan(beforeIds.length);
  });
});
