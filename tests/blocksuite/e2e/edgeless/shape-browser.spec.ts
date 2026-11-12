import { expect, type Page } from '@playwright/test';

import {
  edgelessCommonSetup,
  getCanvasElementsCount,
  getFrameTitle,
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
  await expect(browserPanel.locator('.edgeless-shapes-panel')).toBeVisible();
  return browserPanel;
}

async function getCategoryShapeNames(
  browserPanel: ReturnType<Page['locator']>,
  categoryName: string
) {
  const categories = browserPanel.locator('.category-entry');
  const target = categories.filter({ hasText: categoryName });
  await expect(target).toBeVisible();
  await target.first().click();

  const names = browserPanel.locator('.shape-item .shape-name');
  await expect(names.first()).toBeVisible();
  return (await names.allTextContents()).map(text => text.trim());
}

async function getExpectedCategoryTooltips(
  browserPanel: ReturnType<Page['locator']>,
  categoryId: string
) {
  return browserPanel.evaluate((panel, targetCategory) => {
    const element = panel as any;
    if (!element?._getShapesForCategory) {
      throw new Error('shape browser panel missing category helper');
    }
    const shapes = element._getShapesForCategory(targetCategory) as Array<{
      tooltip: string;
    }>;
    return shapes.map(item => item.tooltip);
  }, categoryId);
}

test.describe('shape browser', () => {
  test('shape menu opens without selecting a shape', async ({ page }) => {
    await edgelessCommonSetup(page);

    const beforeCount = await getCanvasElementsCount(page);
    await setEdgelessTool(page, 'shape');
    const menu = page.locator('edgeless-shape-menu');

    await expect(menu.first()).toBeVisible();

    const afterCount = await getCanvasElementsCount(page);
    expect(afterCount).toBe(beforeCount);
  });

  test('shape menu more opens the shape browser panel', async ({ page }) => {
    await edgelessCommonSetup(page);

    const browserPanel = await openShapeBrowser(page);

    await page.keyboard.press('Escape');
    await expect(browserPanel).toBeHidden();
  });

  test('shape browser search filters visible shapes', async ({ page }) => {
    await edgelessCommonSetup(page);

    const browserPanel = await openShapeBrowser(page);
    const searchInput = browserPanel.locator('.search-input');
    await searchInput.fill('zzzz-nonexistent');
    const emptyState = browserPanel.locator('.empty-state');
    await expect(emptyState).toBeVisible();
  });

  test('shape browser layout responds to viewport width', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 720 });
    await edgelessCommonSetup(page);

    const browserPanel = await openShapeBrowser(page);
    const panel = browserPanel.locator('.edgeless-shapes-panel');
    const smallWidth = (await panel.boundingBox())?.width ?? 0;

    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1200, height: 720 });
    const reopenedPanel = await openShapeBrowser(page);
    const largeWidth =
      (await reopenedPanel.locator('.edgeless-shapes-panel').boundingBox())
        ?.width ?? 0;

    expect(smallWidth).toBeGreaterThan(0);
    expect(smallWidth).toBeLessThanOrEqual(480);
    expect(largeWidth).toBeGreaterThanOrEqual(smallWidth);
  });

  test('shape browser list is scrollable', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await edgelessCommonSetup(page);

    const browserPanel = await openShapeBrowser(page);
    const categories = browserPanel.locator('.category-entry');
    const flowchartCategory = categories.filter({ hasText: 'Flowchart' });
    if ((await flowchartCategory.count()) > 0) {
      await flowchartCategory.first().click();
    } else if ((await categories.count()) > 0) {
      await categories.first().click();
    }

    const scrollable = browserPanel.locator('.shapes-scrollcontent');
    const { scrollHeight, clientHeight } = await scrollable.evaluate(el => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));

    expect(scrollHeight).toBeGreaterThan(clientHeight);

    await scrollable.evaluate(el => {
      el.scrollTop = el.scrollHeight;
    });
    const scrolledTop = await scrollable.evaluate(el => el.scrollTop);
    expect(scrolledTop).toBeGreaterThan(0);
  });

  test('shape browser shows expected categories', async ({ page }) => {
    await edgelessCommonSetup(page);

    const browserPanel = await openShapeBrowser(page);
    const categories = browserPanel.locator('.category-entry');
    const categoryTexts = (await categories.allTextContents()).map(text =>
      text.trim()
    );

    expect(categoryTexts).toContain('General');
    expect(categoryTexts).toContain('Flowchart');
    expect(categoryTexts).toContain('Arrows');
  });

  test('shape browser orders imported library categories after base ordering', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    const baseOrder = ['General', 'Flowchart', 'Arrows', 'Basic', 'Misc'];
    const browserPanel = await openShapeBrowser(page);
    const categories = browserPanel.locator('.category-entry');
    const categoryTexts = (await categories.allTextContents())
      .map(text => text.trim())
      .filter(Boolean);

    const baseInList = baseOrder.filter(name => categoryTexts.includes(name));
    const baseIndexes = baseInList.map(name => categoryTexts.indexOf(name));
    for (let i = 1; i < baseIndexes.length; i += 1) {
      expect(baseIndexes[i]).toBeGreaterThan(baseIndexes[i - 1]);
    }

    const extras = categoryTexts.filter(name => !baseOrder.includes(name));
    expect(extras).toEqual([]);
  });

  test('shape browser closes when frame editor closes', async ({ page }) => {
    await edgelessCommonSetup(page);
    const browserPanel = await openShapeBrowser(page);

    const frameId = await page.evaluate(() => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      return root.service.crud.addBlock(
        'affine:frame',
        { xywh: '[100,100,300,200]' },
        root.service.surface.id
      );
    });
    await expect(
      page.locator(`affine-frame-title[data-id="${frameId}"]`)
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(browserPanel).toBeHidden();
  });

  test('flowchart category includes all flowchart shapes', async ({ page }) => {
    await edgelessCommonSetup(page);

    const browserPanel = await openShapeBrowser(page);
    const actual = await getCategoryShapeNames(browserPanel, 'Flowchart');
    const expected = await getExpectedCategoryTooltips(
      browserPanel,
      'flowchart'
    );

    expect(new Set(actual)).toEqual(new Set(expected));
  });

  test('arrows category includes all arrow shapes', async ({ page }) => {
    await edgelessCommonSetup(page);

    const browserPanel = await openShapeBrowser(page);
    const actual = await getCategoryShapeNames(browserPanel, 'Arrows');
    const expected = await getExpectedCategoryTooltips(browserPanel, 'arrows');

    expect(new Set(actual)).toEqual(new Set(expected));
  });

  test('shape menu auto-sizes on touch viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await edgelessCommonSetup(page);

    await setEdgelessTool(page, 'shape');
    const menu = page.locator('edgeless-slide-menu').first();
    await expect(menu).toBeVisible();

    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    if (box && viewport) {
      expect(box.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test('peek mode shape search inserts actor shape', async ({ page }) => {
    await edgelessCommonSetup(page);

    const frameId = await page.evaluate(() => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      return root.service.crud.addBlock(
        'affine:frame',
        { xywh: '[100,100,420,280]' },
        root.service.surface.id
      );
    });

    const frameTitle = getFrameTitle(page, frameId);
    await expect(frameTitle).toBeVisible();
    await frameTitle.dblclick({ force: true });

    const actorCountBefore = await page.evaluate(() => {
      const roots = Array.from(
        document.querySelectorAll('affine-edgeless-root')
      ) as any[];
      const active = roots.at(-1);
      if (!active) throw new Error('active edgeless root not found');
      return active.gfx.surface
        .getElementsByType('shape')
        .filter((el: any) => el.shapeType === 'actor').length;
    });

    const browserPanel = await openShapeBrowser(page);
    const searchInput = browserPanel.locator('.search-input');
    await searchInput.click();
    await page.keyboard.type('Actor');

    const actorResult = browserPanel.locator('.shape-item', {
      hasText: 'Actor',
    });
    await expect(actorResult).toHaveCount(1);
    await actorResult.first().click();

    const clickPoint = await page.evaluate(() => {
      const roots = Array.from(
        document.querySelectorAll('affine-edgeless-root')
      ) as any[];
      const active = roots.at(-1) as HTMLElement | undefined;
      if (!active) throw new Error('active edgeless root not found');
      const rect = active.getBoundingClientRect();
      return {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.45,
      };
    });
    await page.mouse.click(clickPoint.x, clickPoint.y);

    const actorCountAfter = await page.evaluate(() => {
      const roots = Array.from(
        document.querySelectorAll('affine-edgeless-root')
      ) as any[];
      const active = roots.at(-1);
      if (!active) throw new Error('active edgeless root not found');
      return active.gfx.surface
        .getElementsByType('shape')
        .filter((el: any) => el.shapeType === 'actor').length;
    });

    expect(actorCountAfter).toBe(actorCountBefore + 1);
  });
});
