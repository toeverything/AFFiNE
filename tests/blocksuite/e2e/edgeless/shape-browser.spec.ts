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

test.describe('shape browser', () => {
  test('shape menu opens without selecting a shape', async ({ page }) => {
    await edgelessCommonSetup(page);

    const beforeCount = await getCanvasElementsCount(page);
    await openShapeMenuWithoutSelection(page);

    const menu = page.locator('edgeless-slide-menu');
    await expect(menu).toBeVisible();

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
});
