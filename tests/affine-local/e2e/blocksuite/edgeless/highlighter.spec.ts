import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickView,
  dragView,
  locateEditorContainer,
  locateToolbar,
  setEdgelessTool,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickEdgelessModeButton(page);
  const container = locateEditorContainer(page);
  await container.click();
});

test('should add highlighter', async ({ page }) => {
  await setEdgelessTool(page, 'highlighter');
  await dragView(page, [100, 300], [200, 400]);

  await setEdgelessTool(page, 'default');
  await clickView(page, [150, 350]);

  const toolbar = locateToolbar(page);

  await page.waitForTimeout(250);

  await expect(toolbar).toBeVisible();

  const lineWidthButton = toolbar
    .locator('affine-slider')
    .locator('.point-button[data-selected]')
    .last();
  const defaultLineWidth = await lineWidthButton.getAttribute('aria-label');

  expect(defaultLineWidth).toBe('22');
});

test('should exit drawing tools menu when Escape is pressed', async ({
  page,
}) => {
  await setEdgelessTool(page, 'highlighter');

  const drawingToolsMenu = page.locator('edgeless-pen-menu');

  await expect(drawingToolsMenu).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(drawingToolsMenu).toBeHidden();
});

test('should enter highlighter tool when `Shift + P` is pressed', async ({
  page,
}) => {
  const drawingToolButton = page.locator('.edgeless-pen-button');
  const drawingToolsMenu = page.locator('edgeless-pen-menu');

  await expect(drawingToolButton).toHaveAttribute('data-drawing-tool', 'brush');
  await expect(drawingToolsMenu).toBeHidden();

  await page.keyboard.press('Shift+P');

  await expect(drawingToolButton).toHaveAttribute(
    'data-drawing-tool',
    'highlighter'
  );
  await expect(drawingToolsMenu).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawingToolsMenu).toBeHidden();
  await expect(drawingToolButton).toHaveAttribute(
    'data-drawing-tool',
    'highlighter'
  );
});
