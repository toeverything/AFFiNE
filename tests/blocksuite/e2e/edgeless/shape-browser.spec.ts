import { expect, type Page } from '@playwright/test';

import {
  edgelessCommonSetup,
  getCanvasElementsCount,
  openShapeMenuWithoutSelection,
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
    const menu = await openShapeMenuWithoutSelection(page);

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
    const smallColumns = await panel.evaluate(el =>
      Number(
        getComputedStyle(el).getPropertyValue('--shape-browser-columns').trim()
      )
    );

    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1200, height: 720 });
    const reopenedPanel = await openShapeBrowser(page);
    const largeColumns = await reopenedPanel
      .locator('.edgeless-shapes-panel')
      .evaluate(el =>
        Number(
          getComputedStyle(el)
            .getPropertyValue('--shape-browser-columns')
            .trim()
        )
      );

    expect(smallColumns).toBeGreaterThan(0);
    expect(smallColumns).toBeLessThanOrEqual(3);
    expect(largeColumns).toBeGreaterThanOrEqual(smallColumns);
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

    const baseOrder = [
      'General',
      'Flowchart',
      'Arrows',
      'Advanced',
      'Basic',
      'Misc',
    ];
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
    const extrasSorted = [...extras].sort((a, b) => a.localeCompare(b));
    expect(extras).toEqual(extrasSorted);

    if (baseIndexes.length > 0) {
      const lastBaseIndex = Math.max(...baseIndexes);
      const extraIndexes = extras.map(name => categoryTexts.indexOf(name));
      extraIndexes.forEach(index => {
        expect(index).toBeGreaterThan(lastBaseIndex);
      });
    }
  });

  test('shape browser closes when frame editor closes', async ({ page }) => {
    await edgelessCommonSetup(page);
    const browserPanel = await openShapeBrowser(page);

    const frameId = await page.evaluate(async () => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      const { Bound } =
        await import('/@fs/workspace/AFFiNE/blocksuite/framework/global/src/gfx/model/bound.ts');
      const { EdgelessFrameManagerIdentifier } =
        await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/frame-manager.ts');
      const frameManager = root.service.std.getOptional(
        EdgelessFrameManagerIdentifier
      );
      if (!frameManager) throw new Error('frame manager not found');
      const frame = frameManager.createFrameOnBound(
        new Bound(100, 100, 300, 200)
      );
      return frame?.id;
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
});
