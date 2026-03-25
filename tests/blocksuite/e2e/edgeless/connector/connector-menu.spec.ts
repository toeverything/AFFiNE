import { expect, type Locator, type Page } from '@playwright/test';

import {
  createConnectorElement,
  edgelessCommonSetup,
  getEdgelessElementBound,
  locatorComponentToolbarMoreButton,
  selectElementsByService,
  setEdgelessTool,
  toViewCoord,
} from '../../utils/actions/edgeless.js';
import { test } from '../../utils/playwright.js';

async function openConnectorMenu(page: Page) {
  await setEdgelessTool(page, 'connector');
  const menu = page.locator('edgeless-connector-menu');
  await expect(menu).toBeVisible();
  return menu;
}

async function getConnectorProps(page: Page, id: string) {
  return page.evaluate(connectorId => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const model = root.service.crud.getElementById(connectorId);
    if (!model) throw new Error('connector not found');
    return {
      mode: model.mode,
      cornerRadius: model.cornerRadius,
      strokeWidth: model.strokeWidth,
      strokeStyle: model.strokeStyle,
      frontEndpointStyle: model.frontEndpointStyle,
    };
  }, id);
}

async function getLatestConnectorId(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const connectors = root.service.crud.getElementsByType('connector');
    return connectors[connectors.length - 1]?.id ?? null;
  });
}

async function openPropertiesPanel(page: Page) {
  const moreButton = locatorComponentToolbarMoreButton(page);
  await expect(moreButton).toBeVisible();
  await moreButton.evaluate(el => (el as any).show?.(true));
  const action = moreButton
    .locator('editor-menu-action')
    .filter({ hasText: 'Properties' })
    .first();
  await expect(action).toBeVisible();
  await action.evaluate(el => (el as HTMLElement).click());
  const modal = page.locator('properties-modal');
  await expect(modal).toBeVisible();
  return modal;
}

async function setNumberProperty(modal: Locator, label: string, value: number) {
  await modal.evaluate(
    (element, { label, value }) => {
      const root = element.shadowRoot ?? element;
      const labels = Array.from(
        root.querySelectorAll('.property-label')
      ) as HTMLElement[];
      const labelEl = labels.find(el => el.textContent?.trim() === label);
      const row = labelEl?.closest('.property-row') as HTMLElement | null;
      const input = row?.querySelector(
        'input.property-input'
      ) as HTMLInputElement | null;
      if (!input) throw new Error(`input not found for ${label}`);
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { label, value }
  );
}

async function focusElement(page: Page, id: string) {
  const [x, y, w, h] = await getEdgelessElementBound(page, id);
  const [vx, vy] = await toViewCoord(page, [x + w / 2, y + h / 2]);
  await page.mouse.click(vx, vy);
}

test.describe('connector menu', () => {
  test('rounded connector appears in type menu', async ({ page }) => {
    await edgelessCommonSetup(page);
    const menu = await openConnectorMenu(page);
    const roundedButton = menu.locator('edgeless-tool-icon-button', {
      hasText: 'Rounded',
    });
    await expect(roundedButton).toBeVisible();
  });

  test('jump style selector appears in connector menu', async ({ page }) => {
    await edgelessCommonSetup(page);
    const menu = await openConnectorMenu(page);
    const selector = menu.locator('.jump-style-select');
    await expect(selector).toBeVisible();
    await expect(selector.locator('option')).toContainText(['None', 'Arc']);
  });

  test('new connector uses last menu-selected mode and width', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const menu = await openConnectorMenu(page);

    const curveButton = menu.locator('edgeless-tool-icon-button', {
      hasText: 'Curve',
    });
    await curveButton.click();

    const widthButtons = menu.locator(
      'edgeless-line-width-panel .point-button'
    );
    const lastWidth = widthButtons.last();
    await lastWidth.click();

    const firstId = await createConnectorElement(page, [80, 140], [320, 140]);
    const firstProps = await getConnectorProps(page, firstId);

    const secondId = await createConnectorElement(page, [80, 220], [320, 220]);
    const secondProps = await getConnectorProps(page, secondId);

    expect(secondProps.mode).toBe(firstProps.mode);
    expect(secondProps.strokeWidth).toBe(firstProps.strokeWidth);
  });

  test('new connector uses last properties menu style', async ({ page }) => {
    await edgelessCommonSetup(page);
    await createConnectorElement(page, [100, 260], [320, 260]);
    const connectorId = await getLatestConnectorId(page);
    expect(connectorId).toBeTruthy();
    await selectElementsByService(page, [connectorId!]);
    await focusElement(page, connectorId!);

    const modal = await openPropertiesPanel(page);
    const strokeRow = modal
      .locator('.property-row')
      .filter({ hasText: /Stroke style/ });
    await strokeRow.locator('select.property-select').selectOption({
      label: 'Dot',
    });
    await page.keyboard.press('Escape');

    const baseProps = await getConnectorProps(page, connectorId!);
    await createConnectorElement(page, [100, 320], [320, 320]);
    const nextId = await getLatestConnectorId(page);
    expect(nextId).toBeTruthy();
    const nextProps = await getConnectorProps(page, nextId!);
    expect(nextProps.strokeStyle).toBe(baseProps.strokeStyle);
  });

  test('rounded connector updates corner radius', async ({ page }) => {
    await edgelessCommonSetup(page);
    const menu = await openConnectorMenu(page);
    await menu
      .locator('edgeless-tool-icon-button', { hasText: 'Rounded' })
      .click();

    const connectorId = await createConnectorElement(
      page,
      [80, 180],
      [320, 180]
    );
    await selectElementsByService(page, [connectorId]);
    await focusElement(page, connectorId);

    const modal = await openPropertiesPanel(page);
    await setNumberProperty(modal, 'Corner radius', 18);

    const props = await getConnectorProps(page, connectorId);
    expect(props.cornerRadius).toBe(18);
  });
});
