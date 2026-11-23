import { expect, type Locator, type Page } from '@playwright/test';

import { dragBetweenCoords } from '../utils/actions/drag.js';
import {
  addBasicShapeElement,
  Shape,
  switchEditorMode,
  triggerComponentToolbarAction,
} from '../utils/actions/edgeless.js';
import {
  enterPlaygroundRoom,
  initEmptyEdgelessState,
} from '../utils/actions/misc.js';
import { parseStringToRgba } from '../utils/bs-alternative.js';
import { test } from '../utils/playwright.js';

async function setupWithColorPickerFunction(page: Page) {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
}

function getColorPanelWithLabel(page: Page, label: string) {
  return page.locator(`edgeless-color-panel[aria-label="${label}"]`);
}

function getCurrentColorUnitButton(locator: Locator) {
  return locator.locator('edgeless-color-button').locator('.color-unit').nth(0);
}

function getCurrentColor(locator: Locator) {
  return locator.evaluate(ele =>
    getComputedStyle(ele.querySelector('svg')!).getPropertyValue('fill')
  );
}

function getCustomButton(locator: Locator) {
  return locator.locator('edgeless-color-custom-button');
}

function getColorPickerPanel(locator: Locator) {
  return locator.locator('edgeless-color-picker');
}

function getPaletteControl(locator: Locator) {
  return locator.locator('.color-palette');
}

function getHueControl(locator: Locator) {
  return locator.locator('.color-slider-wrapper.hue .color-slider');
}

function getAlphaControl(locator: Locator) {
  return locator.locator('.color-slider-wrapper.alpha .color-slider');
}

function getHexInput(locator: Locator) {
  return locator.locator('label.color input');
}

function getAlphaInput(locator: Locator) {
  return locator.locator('label.alpha input');
}

// Basic functions
test.describe('basic functions', () => {
  test('custom color button should be displayed', async ({ page }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');
    await expect(fillColorPanel).toBeVisible();

    const customButton = getCustomButton(fillColorPanel);
    await expect(customButton).toBeVisible();
  });

  test('should open color-picker panel when clicking on custom color button', async ({
    page,
  }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');
    const customButton = getCustomButton(fillColorPanel);

    await customButton.click();

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    const colorPickerPanel = getColorPickerPanel(toolbar);

    await expect(colorPickerPanel).toBeVisible();
  });

  test('should close color-picker panel when clicking on outside', async ({
    page,
  }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');
    const currentColorUnit = getCurrentColorUnitButton(fillColorPanel);

    const value = await getCurrentColor(currentColorUnit);
    await expect(currentColorUnit.locator('svg')).toHaveCSS('fill', value);

    const customButton = getCustomButton(fillColorPanel);

    await customButton.click();

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    const colorPickerPanel = getColorPickerPanel(toolbar);

    await expect(colorPickerPanel).toBeVisible();

    await colorPickerPanel.click({ position: { x: 10, y: 10 } });
    await expect(colorPickerPanel).toBeVisible();

    await page.mouse.click(0, 0);

    await expect(colorPickerPanel).toBeHidden();
  });

  test('should return to the palette panel when re-clicking the color button', async ({
    page,
  }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');
    const customButton = getCustomButton(fillColorPanel);

    await customButton.click();

    const colorPickerPanel = getColorPickerPanel(toolbar);
    await expect(colorPickerPanel).toBeVisible();

    await page.mouse.click(0, 0);

    await expect(colorPickerPanel).toBeHidden();

    await dragBetweenCoords(page, { x: 125, y: 75 }, { x: 175, y: 225 });

    await toolbar.getByLabel(/^Color$/).click();

    await expect(customButton).toBeVisible();
    await expect(colorPickerPanel).toBeHidden();
  });

  test('should pick a color when clicking on the palette canvas', async ({
    page,
  }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');
    const customButton = getCustomButton(fillColorPanel);

    await customButton.click();

    const colorPickerPanel = getColorPickerPanel(toolbar);
    const paletteControl = getPaletteControl(colorPickerPanel);
    const hexInput = getHexInput(colorPickerPanel);

    const value = await hexInput.inputValue();

    await paletteControl.click();

    const newValue = await hexInput.inputValue();

    expect(value).not.toEqual(newValue);
  });

  test('should pick a color when clicking on the hue control', async ({
    page,
  }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');
    const customButton = getCustomButton(fillColorPanel);

    await customButton.click();

    const colorPickerPanel = getColorPickerPanel(toolbar);
    const hueControl = getHueControl(colorPickerPanel);
    const hexInput = getHexInput(colorPickerPanel);

    const value = await hexInput.inputValue();

    await hueControl.click();

    const newValue = await hexInput.inputValue();

    expect(value).not.toEqual(newValue);
  });

  test('should update color when changing the hex input', async ({ page }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');
    const customButton = getCustomButton(fillColorPanel);

    await customButton.click();

    const colorPickerPanel = getColorPickerPanel(toolbar);
    const hexInput = getHexInput(colorPickerPanel);

    await hexInput.fill('fff');
    await page.keyboard.press('Enter');
    await expect(hexInput).toHaveValue('ffffff');

    await hexInput.fill('000000');
    await page.keyboard.press('Enter');
    await expect(hexInput).toHaveValue('000000');

    await hexInput.fill('fff$');
    await page.keyboard.press('Enter');
    await expect(hexInput).toHaveValue('ffffff');

    await hexInput.fill('#f0f');
    await page.keyboard.press('Enter');
    await expect(hexInput).toHaveValue('ff00ff');
  });

  test('should adjust alpha when clicking on the alpha control', async ({
    page,
  }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');
    const customButton = getCustomButton(fillColorPanel);

    await customButton.click();

    const colorPickerPanel = getColorPickerPanel(toolbar);
    const alphaControl = getAlphaControl(colorPickerPanel);
    const alphaInput = getAlphaInput(colorPickerPanel);

    const value = await alphaInput.inputValue();

    await alphaControl.click();

    const newValue = await alphaInput.inputValue();

    expect(value).not.toEqual(newValue);
  });

  test('should adjust alpha when changing the alpha input', async ({
    page,
  }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');
    const customButton = getCustomButton(fillColorPanel);

    await customButton.click();

    const colorPickerPanel = getColorPickerPanel(toolbar);
    const alphaInput = getAlphaInput(colorPickerPanel);

    await alphaInput.fill('101');
    await expect(alphaInput).toHaveValue('100');

    await alphaInput.fill('-1');
    await expect(alphaInput).toHaveValue('1');

    await alphaInput.pressSequentially('--1');
    await expect(alphaInput).toHaveValue('1');

    await alphaInput.pressSequentially('++1');
    await expect(alphaInput).toHaveValue('1');

    await alphaInput.pressSequentially('-+1');
    await expect(alphaInput).toHaveValue('1');

    await alphaInput.pressSequentially('+-1');
    await expect(alphaInput).toHaveValue('1');

    await alphaInput.fill('23');
    await expect(alphaInput).toHaveValue('23');
  });

  test('the computed style should be parsed correctly', async ({ page }) => {
    await setupWithColorPickerFunction(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicShapeElement(page, start0, end0, Shape.Square);

    await triggerComponentToolbarAction(page, 'changeShapeFillColor');

    const fillColorPanel = getColorPanelWithLabel(page, 'Fill color');

    const currentColorUnit = getCurrentColorUnitButton(fillColorPanel);

    const value = await getCurrentColor(currentColorUnit);
    let rgba = parseStringToRgba(value);

    expect(rgba.a).toEqual(1);

    rgba = parseStringToRgba('rgb(25.5,0,0)');
    expect(rgba.r).toBeCloseTo(0.1);

    rgba = parseStringToRgba('rgba(233,233,233, .5)');
    expect(rgba.a).toEqual(0.5);

    rgba = parseStringToRgba('transparent');
    expect(rgba).toEqual({ r: 1, g: 1, b: 1, a: 0 });

    rgba = parseStringToRgba('--blocksuite-transparent');
    expect(rgba).toEqual({ r: 1, g: 1, b: 1, a: 0 });

    rgba = parseStringToRgba('--affine-palette-transparent');
    expect(rgba).toEqual({ r: 1, g: 1, b: 1, a: 0 });

    rgba = parseStringToRgba('#ff0');
    expect(rgba).toEqual({ r: 1, g: 1, b: 0, a: 1 });

    rgba = parseStringToRgba('#ff09');
    expect(rgba).toEqual({ r: 1, g: 1, b: 0, a: 0.6 });
  });
});
