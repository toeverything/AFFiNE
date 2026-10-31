import { expect, type Page } from '@playwright/test';
import { lightThemeV2 } from '@toeverything/theme/v2';

import { dragBetweenCoords } from '../utils/actions/drag.js';
import {
  createConnectorElement,
  createShapeElement,
  edgelessCommonSetup,
  getEdgelessElementBound,
  locatorComponentToolbar,
  locatorEdgelessToolButton,
  pickColorAtPoints,
  selectBrushColor,
  setEdgelessTool,
  Shape,
  toViewCoord,
} from '../utils/actions/edgeless.js';
import { assertEdgelessColorSameWithHexColor } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

async function getConnectorProps(page: Page, elementId: string) {
  return page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const element = root.service.crud.getElementById(id);
    if (!element) throw new Error('connector not found');
    return {
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
      strokeStyle: element.strokeStyle,
    };
  }, elementId);
}

async function getShapeProps(page: Page, elementId: string) {
  return page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const element = root.service.crud.getElementById(id);
    if (!element) throw new Error('shape not found');
    return {
      fillColor: element.fillColor,
      strokeColor: element.strokeColor,
      strokeWidth: element.strokeWidth,
      strokeStyle: element.strokeStyle,
    };
  }, elementId);
}

async function toViewPoints(page: Page, points: number[][]) {
  return page.evaluate(coords => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    return coords.map(([x, y]) => root.service.viewport.toViewCoord(x, y));
  }, points);
}

async function getActivePaletteLabel(panel: ReturnType<Page['locator']>) {
  const label = await panel.evaluate(panelEl => {
    const root = (panelEl as HTMLElement).shadowRoot;
    if (!root) return null;
    const buttons = Array.from(
      root.querySelectorAll('edgeless-color-button')
    ) as Array<HTMLElement & { label?: string }>;
    const active = buttons.find(button => button.hasAttribute('active'));
    if (!active) return null;
    return (
      active.label ||
      active.getAttribute('label') ||
      active.shadowRoot
        ?.querySelector('.color-unit')
        ?.getAttribute('aria-label')
    );
  });
  expect(label).toBeTruthy();
  return label;
}

async function openShapeMenu(page: Page) {
  const shapeTool = await locatorEdgelessToolButton(page, 'shape', false);
  const slideMenu = page.locator('edgeless-slide-menu').first();
  for (let i = 0; i < 2; i += 1) {
    await shapeTool.click({ position: { x: 5, y: 5 } });
    if (await slideMenu.isVisible()) break;
    await page.waitForTimeout(100);
  }
  await expect(slideMenu).toBeVisible();
  return slideMenu;
}

async function clickShapeTypeButton(page: Page, index: number) {
  await page
    .locator(
      'edgeless-shape-menu .shape-type-container edgeless-tool-icon-button'
    )
    .nth(index)
    .click({ force: true });
}

async function createShapeWithFallback(
  page: Page,
  coord1: number[],
  coord2: number[]
) {
  const createdId = await createShapeElement(
    page,
    coord1,
    coord2,
    Shape.Square
  );
  if (createdId) return createdId;
  const [x1, y1] = coord1;
  const [x2, y2] = coord2;
  const xywh: [number, number, number, number] = [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.abs(x2 - x1),
    Math.abs(y2 - y1),
  ];
  return page.evaluate(coords => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    return root.service.crud.addElement('shape', {
      shapeType: 'rect',
      xywh: JSON.stringify(coords),
      radius: 0,
    });
  }, xywh);
}

async function clickElementCenter(page: Page, id: string) {
  const [x, y, w, h] = await getEdgelessElementBound(page, id);
  const [vx, vy] = await toViewCoord(page, [x + w / 2, y + h / 2]);
  await page.mouse.click(vx, vy);
}

async function selectElementsByService(page: Page, elements: string[]) {
  await page.evaluate(ids => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    root.service.selection.set({ elements: ids, editing: false });
  }, elements);
}

test.describe('shape palettes', () => {
  test('palette picker appears for shapes and connectors', async ({ page }) => {
    await edgelessCommonSetup(page);

    await setEdgelessTool(page, 'shape');
    const shapeMenu = page.locator('edgeless-shape-menu');
    await expect(shapeMenu).toBeVisible();
    await expect(
      shapeMenu.locator('edgeless-color-panel, .color-panel-container').first()
    ).toBeVisible();

    await setEdgelessTool(page, 'connector');
    const connectorMenu = page.locator('edgeless-connector-menu');
    await expect(connectorMenu).toBeVisible();
    await expect(
      connectorMenu
        .locator('edgeless-color-panel, .color-panel-container')
        .first()
    ).toBeVisible();
  });

  test('palette picker appears for brush tool', async ({ page }) => {
    await edgelessCommonSetup(page);

    await setEdgelessTool(page, 'brush');
    const penMenu = page.locator('edgeless-pen-menu');
    await expect(penMenu).toBeVisible();
    await expect(penMenu.locator('edgeless-color-panel')).toBeVisible();
  });

  test('shape palette selection persists across shape menu opens', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    await openShapeMenu(page);
    let shapeMenu = page.locator('edgeless-shape-menu');
    await expect(shapeMenu).toBeVisible();
    let colorPanel = shapeMenu.locator('edgeless-color-panel');
    await expect(colorPanel).toBeVisible();
    await colorPanel
      .locator('.color-unit[aria-label="Green"]')
      .first()
      .click({ force: true });
    await page.keyboard.press('Escape');

    await openShapeMenu(page);
    const reopenedPanel = page.locator(
      'edgeless-shape-menu edgeless-color-panel'
    );
    const activeAfterGreen = await getActivePaletteLabel(reopenedPanel);
    expect(activeAfterGreen).toBe('Green');

    await page.keyboard.press('Escape');
    await openShapeMenu(page);
    shapeMenu = page.locator('edgeless-shape-menu');
    await expect(shapeMenu).toBeVisible();
    colorPanel = shapeMenu.locator('edgeless-color-panel');
    await expect(colorPanel).toBeVisible();
    await colorPanel
      .locator('.color-unit[aria-label="Blue"]')
      .first()
      .click({ force: true });
    await page.keyboard.press('Escape');

    await openShapeMenu(page);
    const activeAfterBlue = await getActivePaletteLabel(reopenedPanel);
    expect(activeAfterBlue).toBe('Blue');
  });

  test('shape palette selection persists when switching tools', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    await openShapeMenu(page);
    const shapePanel = page.locator('edgeless-shape-menu edgeless-color-panel');
    await expect(shapePanel).toBeVisible();
    await shapePanel
      .locator('.color-unit[aria-label="Green"]')
      .first()
      .click({ force: true });

    await setEdgelessTool(page, 'connector');
    await setEdgelessTool(page, 'shape');

    const reopenedPanel = page.locator(
      'edgeless-shape-menu edgeless-color-panel'
    );
    const activeAfterSwitch = await getActivePaletteLabel(reopenedPanel);
    expect(activeAfterSwitch).toBe('Green');
  });

  test('square keeps palette independent from triangle bucket', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    await openShapeMenu(page);
    await clickShapeTypeButton(page, 3);
    let panel = page.locator('edgeless-shape-menu edgeless-color-panel');
    await panel
      .locator('.color-unit[aria-label="Green"]')
      .first()
      .click({ force: true });
    await page.keyboard.press('Escape');

    await openShapeMenu(page);
    await clickShapeTypeButton(page, 0);
    panel = page.locator('edgeless-shape-menu edgeless-color-panel');
    await panel
      .locator('.color-unit[aria-label="Blue"]')
      .first()
      .click({ force: true });
    await page.keyboard.press('Escape');

    await openShapeMenu(page);
    await clickShapeTypeButton(page, 0);
    const squarePanel = page.locator(
      'edgeless-shape-menu edgeless-color-panel'
    );
    const squareColor = await getActivePaletteLabel(squarePanel);
    expect(squareColor).toBe('Blue');
    await page.keyboard.press('Escape');

    await openShapeMenu(page);
    await clickShapeTypeButton(page, 3);
    const trianglePanel = page.locator(
      'edgeless-shape-menu edgeless-color-panel'
    );
    const triangleColor = await getActivePaletteLabel(trianglePanel);
    expect(triangleColor).toBe('Green');
  });

  test('connector palette selection persists across menu opens', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    await setEdgelessTool(page, 'connector');
    let connectorMenu = page.locator('edgeless-connector-menu');
    await expect(connectorMenu).toBeVisible();
    let colorPanel = connectorMenu.locator('edgeless-color-panel');
    await expect(colorPanel).toBeVisible();
    await colorPanel
      .locator('.color-unit[aria-label="Green"]')
      .first()
      .evaluate(el => (el as HTMLElement).click());
    await page.keyboard.press('Escape');

    await setEdgelessTool(page, 'connector');
    const reopenedPanel = page.locator(
      'edgeless-connector-menu edgeless-color-panel'
    );
    const activeAfterGreen = await getActivePaletteLabel(reopenedPanel);
    expect(activeAfterGreen).toBe('Green');

    await page.keyboard.press('Escape');
    await setEdgelessTool(page, 'connector');
    connectorMenu = page.locator('edgeless-connector-menu');
    await expect(connectorMenu).toBeVisible();
    colorPanel = connectorMenu.locator('edgeless-color-panel');
    await expect(colorPanel).toBeVisible();
    await colorPanel
      .locator('.color-unit[aria-label="Blue"]')
      .first()
      .evaluate(el => (el as HTMLElement).click());
    await page.keyboard.press('Escape');

    await setEdgelessTool(page, 'connector');
    const activeAfterBlue = await getActivePaletteLabel(reopenedPanel);
    expect(activeAfterBlue).toBe('Blue');
  });

  test('connector palette selection applies to new connectors', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    await setEdgelessTool(page, 'connector');
    const connectorMenu = page.locator('edgeless-connector-menu');
    await expect(connectorMenu).toBeVisible();
    const colorPanel = connectorMenu.locator('edgeless-color-panel');
    await expect(colorPanel).toBeVisible();
    await colorPanel.locator('.color-unit[aria-label="Green"]').first().click();

    const firstId = await createConnectorElement(page, [0, 0], [200, 0]);
    const firstStroke = (await getConnectorProps(page, firstId)).stroke;

    await setEdgelessTool(page, 'connector');
    await colorPanel.locator('.color-unit[aria-label="Blue"]').first().click();
    const secondId = await createConnectorElement(page, [0, 120], [200, 120]);
    const secondStroke = (await getConnectorProps(page, secondId)).stroke;

    expect(firstStroke).toBeTruthy();
    expect(secondStroke).toBeTruthy();
    expect(secondStroke).not.toBe(firstStroke);
  });

  test('brush palette selection persists for new strokes', async ({ page }) => {
    await edgelessCommonSetup(page);

    await setEdgelessTool(page, 'brush');
    await selectBrushColor(page, 'Blue');
    await setEdgelessTool(page, 'default');

    await setEdgelessTool(page, 'brush');
    const start = { x: 100, y: 100 };
    const end = { x: 200, y: 100 };
    await dragBetweenCoords(page, start, end, { steps: 80 });

    const [pickedColor] = await pickColorAtPoints(page, [[110, 100]]);
    const color = lightThemeV2['edgeless/palette/medium/blueMedium'];
    await assertEdgelessColorSameWithHexColor(page, color, pickedColor);
  });

  test('shape menu palette and stroke controls apply to new shapes', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    const baseShapeId = await createShapeWithFallback(page, [0, 0], [100, 100]);
    await selectElementsByService(page, [baseShapeId]);
    await clickElementCenter(page, baseShapeId);

    const toolbar = locatorComponentToolbar(page);
    const colorPicker = toolbar.locator('edgeless-shape-color-picker');
    await expect(colorPicker).toBeVisible();

    await colorPicker.evaluate(pickerEl => {
      const picker = pickerEl as any;
      const root = picker.shadowRoot as ShadowRoot | null;
      if (!root) throw new Error('color picker shadow root not found');
      const menuButton = root.querySelector('editor-menu-button') as any;
      if (!menuButton) throw new Error('menu button not found');
      menuButton.show(true);

      const clickColor = (panel: Element | null, label: string) => {
        const panelRoot = (panel as HTMLElement | null)?.shadowRoot;
        if (!panelRoot) throw new Error('color panel shadow root not found');
        const buttons = Array.from(
          panelRoot.querySelectorAll('edgeless-color-button')
        );
        const target = buttons.find(button => {
          const unit = button.shadowRoot?.querySelector('.color-unit');
          return unit?.getAttribute('aria-label') === label;
        });
        if (!target) throw new Error(`color not found: ${label}`);
        (target as HTMLElement).click();
      };

      const fillPanel = root.querySelector(
        'edgeless-color-panel[aria-label="Fill color"]'
      );
      clickColor(fillPanel, 'MediumGreen');

      const gradientToggle = Array.from(
        root.querySelectorAll('.mode-button')
      ).find(button => button.textContent?.trim() === 'Gradient');
      if (!gradientToggle) throw new Error('gradient toggle not found');
      (gradientToggle as HTMLElement).click();

      const gradientFillPanel = root.querySelector(
        'edgeless-color-panel[aria-label="Fill color"]'
      );
      clickColor(gradientFillPanel, 'MediumBlue');

      const directionButton = root.querySelector(
        '[data-direction="NE"]'
      ) as HTMLElement | null;
      if (!directionButton) throw new Error('gradient direction NE not found');
      directionButton.click();

      const strokePanel = root.querySelector(
        'edgeless-color-panel[aria-label="Border color"]'
      );
      clickColor(strokePanel, 'MediumRed');

      const stylesPanel = root.querySelector(
        'edgeless-line-styles-panel'
      ) as HTMLElement | null;
      const stylesRoot = stylesPanel?.shadowRoot;
      if (!stylesRoot) throw new Error('line styles panel not found');

      const widthPanel = stylesRoot.querySelector(
        'edgeless-line-width-panel'
      ) as HTMLElement | null;
      if (!widthPanel) throw new Error('line width panel not found');
      widthPanel.dispatchEvent(
        new CustomEvent('select', {
          detail: 6,
          bubbles: true,
          composed: true,
        })
      );

      const dashButton = stylesRoot.querySelector(
        '.line-style-button.mode-dash'
      ) as HTMLElement | null;
      if (!dashButton) throw new Error('dash button not found');
      dashButton.click();
    });

    const baseProps = await getShapeProps(page, baseShapeId);
    const newShapeId = await createShapeWithFallback(
      page,
      [160, 0],
      [260, 100]
    );
    const newShapeProps = await getShapeProps(page, newShapeId);
    expect(newShapeProps.fillColor).toBe(baseProps.fillColor);
    expect(newShapeProps.gradientFinal).toBe(baseProps.gradientFinal);
    expect(newShapeProps.gradientDirection).toBe(baseProps.gradientDirection);
    expect(newShapeProps.strokeColor).toBe(baseProps.strokeColor);
    expect(newShapeProps.strokeWidth).toBe(baseProps.strokeWidth);
    expect(newShapeProps.strokeStyle).toBe(baseProps.strokeStyle);
  });

  test('shape menu palette style applies to new shapes', async ({ page }) => {
    await edgelessCommonSetup(page);

    const baseShapeId = await createShapeWithFallback(page, [0, 0], [100, 100]);
    await selectElementsByService(page, [baseShapeId]);

    await openShapeMenu(page);
    const shapeMenu = page.locator('edgeless-shape-menu');
    const colorPanel = shapeMenu.locator('edgeless-color-panel');
    await expect(colorPanel).toBeVisible();
    await colorPanel
      .locator('.color-unit[aria-label="Green"]')
      .first()
      .click({ force: true });
    await page.keyboard.press('Escape');

    const baseProps = await getShapeProps(page, baseShapeId);
    const newShapeId = await createShapeWithFallback(
      page,
      [160, 0],
      [260, 100]
    );
    const newShapeProps = await getShapeProps(page, newShapeId);
    expect(newShapeProps.fillColor).toBe(baseProps.fillColor);
    expect(newShapeProps.strokeColor).toBe(baseProps.strokeColor);
    expect(newShapeProps.strokeWidth).toBe(baseProps.strokeWidth);
    expect(newShapeProps.strokeStyle).toBe(baseProps.strokeStyle);
  });

  test('shape palette gradients render in palette', async ({ page }) => {
    await edgelessCommonSetup(page);

    const slideMenu = await openShapeMenu(page);
    const colorPanel = slideMenu.locator('edgeless-color-panel');
    await expect(colorPanel).toBeVisible();
    const paletteToggle = slideMenu.locator('.palette-toggle-button');
    await expect(paletteToggle).toBeVisible();

    let gradientFound = false;
    for (let i = 0; i < 6; i += 1) {
      await paletteToggle.click();
      const hasGradient = await colorPanel.evaluate(panel => {
        const root = panel.shadowRoot;
        if (!root) return false;
        const buttons = Array.from(
          root.querySelectorAll('edgeless-color-button')
        );
        return buttons.some(button =>
          Boolean(button.shadowRoot?.querySelector('linearGradient'))
        );
      });
      if (hasGradient) {
        gradientFound = true;
        break;
      }
    }

    expect(gradientFound).toBe(true);
  });

  test('gradient palette fills render on canvas', async ({ page }) => {
    await edgelessCommonSetup(page);

    const slideMenu = await openShapeMenu(page);
    const colorPanel = slideMenu.locator('edgeless-color-panel');
    const paletteToggle = slideMenu.locator('.palette-toggle-button');
    await expect(colorPanel).toBeVisible();

    let gradientClicked = false;
    for (let i = 0; i < 6; i += 1) {
      const clicked = await colorPanel.evaluate(panel => {
        const root = panel.shadowRoot;
        if (!root) return false;
        const buttons = Array.from(
          root.querySelectorAll('edgeless-color-button')
        );
        const target = buttons.find(button =>
          Boolean(button.shadowRoot?.querySelector('linearGradient'))
        );
        if (!target) return false;
        (target as HTMLElement).click();
        return true;
      });
      if (clicked) {
        gradientClicked = true;
        break;
      }
      await paletteToggle.click();
    }

    expect(gradientClicked).toBe(true);

    const shapeId = await createShapeWithFallback(page, [100, 100], [400, 260]);
    const [x, y, w, h] = await getEdgelessElementBound(page, shapeId);
    const samplePoints = await toViewPoints(page, [
      [x + w * 0.5, y + h * 0.2],
      [x + w * 0.5, y + h * 0.8],
    ]);
    const colors = await pickColorAtPoints(
      page,
      samplePoints.map(([vx, vy]) => [Math.round(vx), Math.round(vy)])
    );

    expect(colors[0]).not.toBe(colors[1]);
  });

  test('dotted stroke style renders with visible gaps', async ({ page }) => {
    await edgelessCommonSetup(page);

    const connectorId = await createConnectorElement(
      page,
      [100, 200],
      [400, 200]
    );
    await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      root.service.crud.updateElement(id, {
        stroke: '#1f6feb',
        strokeWidth: 6,
        strokeStyle: 'dash',
      });
    }, connectorId);
    await page.waitForTimeout(100);

    const modelPoints: number[][] = [[40, 40]];
    for (let x = 120; x <= 380; x += 20) {
      modelPoints.push([x, 200]);
    }

    const viewPoints = await toViewPoints(page, modelPoints);
    const colors = await pickColorAtPoints(
      page,
      viewPoints.map(([vx, vy]) => [Math.round(vx), Math.round(vy)])
    );

    const background = colors[0];
    const strokeSamples = colors.slice(1);
    const hasGap = strokeSamples.some(color => color === background);
    const hasStroke = strokeSamples.some(color => color !== background);

    expect(hasGap).toBe(true);
    expect(hasStroke).toBe(true);
  });
});
