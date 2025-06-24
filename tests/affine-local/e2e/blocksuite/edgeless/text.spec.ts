import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  locateEditorContainer,
  locateToolbar,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Locator } from '@playwright/test';

function getEdgelessTextColor(text: Locator) {
  return text
    .locator('.affine-block-children-container')
    .first()
    .evaluate(e => e.style.getPropertyValue('--edgeless-text-color'));
}

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickEdgelessModeButton(page);
  const container = locateEditorContainer(page);
  await container.click();
});

test('should update color of edgeless text when switching theme', async ({
  page,
}) => {
  const container = locateEditorContainer(page);
  await container.dblclick();

  await page.waitForSelector('affine-edgeless-text');

  await type(page, 'text color');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const text = page.locator('affine-edgeless-text');

  await text.click();

  const toolbar = locateToolbar(page);

  await expect(toolbar).toBeVisible();

  const colorPicker = toolbar.locator('edgeless-color-picker-button');
  const colorButton = toolbar.getByLabel('Text color');

  await colorButton.click();

  const pickedColorButton = colorPicker.locator(
    'edgeless-color-button[active]'
  );

  let pickedColor = await pickedColorButton.locator('svg').getAttribute('fill');
  let textColor = await getEdgelessTextColor(text);

  await expect(pickedColorButton.getByLabel('Black')).toHaveCount(1);
  expect(pickedColor).toBe(textColor);

  const blackColorButton = colorPicker
    .locator('edgeless-color-button')
    .filter({
      has: page.locator('.color-unit'),
    })
    .filter({
      has: page.getByLabel('Black'),
    });
  await blackColorButton.click();

  pickedColor = await blackColorButton.locator('svg').getAttribute('fill');
  textColor = await getEdgelessTextColor(text);

  expect(pickedColor).toBe(textColor);
  expect(pickedColor).toBe('#000000');

  await page.getByTestId('header-info-button').click();

  await page
    .locator('[data-info-id="edgelessTheme"]')
    .locator('[data-property-value="true"]')
    .locator('button[value="dark"]')
    .click();

  await page.keyboard.press('Escape');

  await expect(page.getByTestId('property-collapsible-section')).toBeHidden();

  await colorButton.click();

  pickedColor = await blackColorButton.locator('svg').getAttribute('fill');
  textColor = await getEdgelessTextColor(text);

  expect(pickedColor).toBe(textColor);
  expect(pickedColor).toBe('#ffffff');
});
