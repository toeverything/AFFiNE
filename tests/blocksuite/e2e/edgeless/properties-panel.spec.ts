import { expect, type Locator, type Page } from '@playwright/test';

import {
  createConnectorElement,
  edgelessCommonSetup,
  getEdgelessElementBound,
  locatorComponentToolbarMoreButton,
  resizeElementByHandle,
  selectElementsByService,
  toViewCoord,
} from '../utils/actions/edgeless.js';
import { test } from '../utils/playwright.js';

async function openPropertiesPanel(page: Page) {
  const moreButton = locatorComponentToolbarMoreButton(page);
  await expect(moreButton).toBeVisible();
  await moreButton.click({ force: true });
  const action = page
    .locator('editor-menu-action')
    .filter({ hasText: 'Properties' })
    .first();
  await expect(action).toBeVisible();
  await action.click();
  const modal = page.locator('properties-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.properties-modal-content')).toBeVisible();
  return modal;
}

async function focusElement(page: Page, id: string) {
  const [x, y, w, h] = await getEdgelessElementBound(page, id);
  const [vx, vy] = await toViewCoord(page, [x + w / 2, y + h / 2]);
  await page.mouse.click(vx, vy);
}

async function createShapeViaService(
  page: Page,
  xywh: [number, number, number, number]
) {
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

function propertyRow(modal: Locator, label: string) {
  const labelLocator = modal
    .locator('.property-label', {
      hasText: new RegExp(`^${label}$`),
    })
    .first();
  return labelLocator.locator('..');
}

async function setNumberProperty(modal: Locator, label: string, value: number) {
  const row = propertyRow(modal, label);
  const input = row.locator('input.property-input');
  await input.click();
  await input.press('Control+A');
  await input.type(String(value), { delay: 50 });
  await input.press('Enter');
  await input.blur();
}

async function setSelectProperty(modal: Locator, label: string, value: string) {
  const row = propertyRow(modal, label);
  const select = row.locator('select.property-select');
  await select.selectOption({ label: value });
}

async function setColorProperty(modal: Locator, label: string, value: string) {
  const row = propertyRow(modal, label);
  const input = row.locator('input[type="color"]');
  await input.fill(value);
}

test.describe('properties panel', () => {
  test('opens from More menu for shapes', async ({ page }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createShapeViaService(page, [100, 100, 160, 100]);
    await selectElementsByService(page, [shapeId]);
    await focusElement(page, shapeId);

    const modal = await openPropertiesPanel(page);
    await expect(
      modal.getByText('Shape Properties', { exact: true })
    ).toBeVisible();
  });

  test('opens from More menu for connectors', async ({ page }) => {
    await edgelessCommonSetup(page);
    const connectorId = await createConnectorElement(
      page,
      [100, 200],
      [300, 200]
    );
    await selectElementsByService(page, [connectorId]);
    await focusElement(page, connectorId);

    const modal = await openPropertiesPanel(page);
    await expect(
      modal.getByText('Connector Properties', { exact: true })
    ).toBeVisible();
  });

  test('updates shape size and stroke styling', async ({ page }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createShapeViaService(page, [120, 120, 140, 100]);
    await selectElementsByService(page, [shapeId]);
    await focusElement(page, shapeId);

    const modal = await openPropertiesPanel(page);
    await setNumberProperty(modal, 'Width', 420);
    await setColorProperty(modal, 'Stroke', '#ff0000');
    await setSelectProperty(modal, 'Stroke style', 'Dot');

    const updated = await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('Missing edgeless root');
      const model = root.service.crud.getElementById(id);
      const [x, y, w, h] = JSON.parse(model.xywh);
      return {
        width: w,
        strokeColor: model.strokeColor,
        strokeStyle: model.strokeStyle,
      };
    }, shapeId);

    expect(updated.width).toBe(420);
    expect(updated.strokeColor).toBe('#ff0000');
    expect(updated.strokeStyle).toBe('dot');
  });

  test('updates connector stroke style', async ({ page }) => {
    await edgelessCommonSetup(page);
    const connectorId = await createConnectorElement(
      page,
      [120, 260],
      [360, 260]
    );
    await selectElementsByService(page, [connectorId]);
    await focusElement(page, connectorId);

    const modal = await openPropertiesPanel(page);
    await setSelectProperty(modal, 'Stroke style', 'Dot');

    const strokeStyle = await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('Missing edgeless root');
      const model = root.service.crud.getElementById(id);
      return model.strokeStyle;
    }, connectorId);

    expect(strokeStyle).toBe('dot');
  });

  test('connector endpoint styles include ERD options', async ({ page }) => {
    await edgelessCommonSetup(page);
    const connectorId = await createConnectorElement(
      page,
      [120, 320],
      [360, 320]
    );
    await selectElementsByService(page, [connectorId]);
    await focusElement(page, connectorId);

    const modal = await openPropertiesPanel(page);
    const startStyle = propertyRow(modal, 'Start style').locator(
      'details.marker-dropdown'
    );
    await startStyle.locator('summary').click();
    await startStyle.evaluate(details => {
      const buttons = Array.from(
        details.querySelectorAll<HTMLButtonElement>('button.marker-button')
      );
      const target = buttons.find(button => {
        const label = button
          .querySelector('.marker-button-label')
          ?.textContent?.trim();
        return label ? label.replace(/\s/g, '').startsWith('ER') : false;
      });
      if (!target) throw new Error('ERD marker not found');
      target.click();
    });

    const frontEndpointStyle = await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('Missing edgeless root');
      const model = root.service.crud.getElementById(id);
      return model.frontEndpointStyle;
    }, connectorId);
    expect(String(frontEndpointStyle).startsWith('ER')).toBe(true);
  });

  test('updates shape position fields', async ({ page }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createShapeViaService(page, [80, 90, 120, 80]);
    await selectElementsByService(page, [shapeId]);
    await focusElement(page, shapeId);

    const modal = await openPropertiesPanel(page);
    await setNumberProperty(modal, 'X', 200);
    await setNumberProperty(modal, 'Y', 180);

    const xValue = await propertyRow(modal, 'X')
      .locator('input.property-input')
      .inputValue();
    const yValue = await propertyRow(modal, 'Y')
      .locator('input.property-input')
      .inputValue();
    expect(xValue).toBe('200');
    expect(yValue).toBe('180');
  });

  test('lock aspect ratio keeps resize proportional', async ({ page }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createShapeViaService(page, [100, 100, 120, 60]);
    await selectElementsByService(page, [shapeId]);
    await focusElement(page, shapeId);

    const modal = await openPropertiesPanel(page);
    const lockRow = propertyRow(modal, 'Lock aspect ratio');
    await lockRow.locator('input[type="checkbox"]').check();
    await page.keyboard.press('Escape');
    await selectElementsByService(page, [shapeId]);
    await focusElement(page, shapeId);
    await page
      .locator('.handle[aria-label="bottom-right"] .resize')
      .waitFor({ state: 'visible' });

    const [beforeX, beforeY, beforeW, beforeH] = await getEdgelessElementBound(
      page,
      shapeId
    );
    const beforeRatio = beforeW / beforeH;

    await resizeElementByHandle(page, { x: 120, y: 60 }, 'bottom-right', 5);

    const [afterX, afterY, afterW, afterH] = await getEdgelessElementBound(
      page,
      shapeId
    );
    expect(afterX).toBe(beforeX);
    expect(afterY).toBe(beforeY);
    expect(afterW).toBeGreaterThan(beforeW);
    expect(afterH).toBeGreaterThan(beforeH);
    const afterRatio = afterW / afterH;
    expect(Math.abs(afterRatio - beforeRatio)).toBeLessThan(0.02);
  });

  test('panel scrolls in peek mode on touch viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await edgelessCommonSetup(page);
    const shapeId = await createShapeViaService(page, [100, 120, 220, 140]);
    await selectElementsByService(page, [shapeId]);
    await focusElement(page, shapeId);
    const modal = await openPropertiesPanel(page);

    const wrapper = modal.locator('.properties-modal-wrapper');
    const before = await wrapper.evaluate(el => (el as HTMLElement).scrollTop);
    await wrapper.evaluate(el => {
      (el as HTMLElement).scrollTop = 200;
    });
    const after = await wrapper.evaluate(el => (el as HTMLElement).scrollTop);
    expect(after).toBeGreaterThan(before);
  });

  test('panel is positioned near bottom on touch viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await edgelessCommonSetup(page);
    const shapeId = await createShapeViaService(page, [100, 120, 220, 140]);
    await selectElementsByService(page, [shapeId]);
    await focusElement(page, shapeId);
    const modal = await openPropertiesPanel(page);

    const wrapper = modal.locator('.properties-modal-wrapper');
    const box = await wrapper.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    if (box && viewport) {
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 8);
    }
  });
});
