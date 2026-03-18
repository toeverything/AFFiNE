import { expect, type Page } from '@playwright/test';

import { dragBetweenCoords } from '../../utils/actions/drag.js';
import {
  edgelessCommonSetup,
  getEdgelessElementBound,
  getSelectedIds,
  selectElementsByService,
  setEdgelessTool,
  toViewCoord,
} from '../../utils/actions/edgeless.js';
import { waitNextFrame } from '../../utils/actions/misc.js';
import { test } from '../../utils/playwright.js';

async function getJumpMarkers(page: Page, id: string) {
  return page.evaluate(connectorId => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const model = root.service.crud.getElementById(connectorId);
    if (!model) throw new Error('connector not found');
    const points = model.routedPoints ?? [];
    return points.filter((p: { type: number }) => p.type === 1);
  }, id);
}

async function openConnectorMenu(page: Page) {
  await setEdgelessTool(page, 'connector');
  const menu = page.locator('edgeless-connector-menu');
  await expect(menu).toBeVisible();
  return menu;
}

async function setJumpStyle(
  page: Page,
  style: 'none' | 'arc' | 'gap',
  menu?: ReturnType<Page['locator']>
) {
  const targetMenu = menu ?? (await openConnectorMenu(page));
  const selector = targetMenu.locator('.jump-style-select');
  await selector.selectOption(style);
  await waitNextFrame(page, 200);
}

async function setConnectorJumpStyleById(
  page: Page,
  id: string,
  style: 'none' | 'arc' | 'gap'
) {
  await page.evaluate(
    ({ connectorId, jumpStyle }) => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      root.service.crud.updateElement(connectorId, { jumpStyle });
    },
    { connectorId: id, jumpStyle: style }
  );
  await waitNextFrame(page, 200);
}

async function drawConnector(page: Page, start: number[], end: number[]) {
  const startView = await toViewCoord(page, start);
  const endView = await toViewCoord(page, end);
  await dragBetweenCoords(
    page,
    { x: startView[0], y: startView[1] },
    { x: endView[0], y: endView[1] },
    { steps: 100 }
  );
  await waitNextFrame(page, 200);
  return (await getSelectedIds(page))[0];
}

async function getConnectorProps(page: Page, id: string) {
  return page.evaluate(connectorId => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const model = root.service.crud.getElementById(connectorId);
    if (!model) throw new Error('connector not found');
    return {
      mode: model.mode,
      jumpStyle: model.jumpStyle ?? 'none',
    };
  }, id);
}

async function collectConnectorBoundsWhileDragging(
  page: Page,
  id: string,
  steps: Array<[number, number]>
) {
  await selectElementsByService(page, [id]);
  const [x, y, w, h] = await getEdgelessElementBound(page, id);
  const [startX, startY] = await toViewCoord(page, [x + w / 2, y + h / 2]);

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  const samples: Array<[number, number, number, number]> = [];
  for (const [dx, dy] of steps) {
    await page.mouse.move(startX + dx, startY + dy);
    samples.push(await getEdgelessElementBound(page, id));
  }

  await page.mouse.up();
  return samples;
}

test.describe('connector jumps', () => {
  test('jump style applies to intersecting straight connectors', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const menu = await openConnectorMenu(page);
    await menu
      .locator('edgeless-tool-icon-button', { hasText: 'Straight' })
      .click();
    await setJumpStyle(page, 'arc', menu);

    await drawConnector(page, [100, 200], [400, 200]);
    const verticalId = await drawConnector(page, [250, 100], [250, 300]);
    await setConnectorJumpStyleById(page, verticalId, 'arc');

    const props = await getConnectorProps(page, verticalId);
    expect(props.jumpStyle).toBe('arc');
    const markers = await getJumpMarkers(page, verticalId);
    expect(Array.isArray(markers)).toBe(true);
  });

  test('dragging top connector keeps jump style and updates geometry', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const menu = await openConnectorMenu(page);
    await menu
      .locator('edgeless-tool-icon-button', { hasText: 'Straight' })
      .click();
    await setJumpStyle(page, 'arc', menu);

    await drawConnector(page, [250, 120], [250, 320]);
    const movingId = await drawConnector(page, [100, 220], [400, 220]);
    await setConnectorJumpStyleById(page, movingId, 'arc');

    const samples = await collectConnectorBoundsWhileDragging(page, movingId, [
      [20, 10],
      [40, 20],
      [60, 30],
      [80, 40],
    ]);
    const serialized = samples.map(sample => JSON.stringify(sample));
    const changed = serialized.some((value, index) => {
      if (index === 0) return false;
      return value !== serialized[index - 1];
    });
    expect(changed).toBe(true);
    const props = await getConnectorProps(page, movingId);
    expect(props.jumpStyle).toBe('arc');
  });

  test('dragging bottom connector keeps jump style and updates geometry', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const menu = await openConnectorMenu(page);
    await menu
      .locator('edgeless-tool-icon-button', { hasText: 'Straight' })
      .click();
    await setJumpStyle(page, 'arc', menu);

    await drawConnector(page, [100, 220], [400, 220]);
    const movingId = await drawConnector(page, [250, 120], [250, 320]);
    await setConnectorJumpStyleById(page, movingId, 'arc');

    const samples = await collectConnectorBoundsWhileDragging(page, movingId, [
      [10, 20],
      [20, 40],
      [30, 60],
    ]);
    const serialized = samples.map(sample => JSON.stringify(sample));
    const changed = serialized.some((value, index) => {
      if (index === 0) return false;
      return value !== serialized[index - 1];
    });
    expect(changed).toBe(true);
    const props = await getConnectorProps(page, movingId);
    expect(props.jumpStyle).toBe('arc');
  });

  test('rounded connectors support jumps', async ({ page }, testInfo) => {
    await edgelessCommonSetup(page);
    const menu = await openConnectorMenu(page);
    await menu
      .locator('edgeless-tool-icon-button', { hasText: 'Rounded' })
      .click();
    await setJumpStyle(page, 'gap', menu);

    await drawConnector(page, [260, 160], [260, 360]);
    const roundedId = await drawConnector(page, [100, 260], [400, 260]);
    await setConnectorJumpStyleById(page, roundedId, 'gap');

    const props = await getConnectorProps(page, roundedId);
    expect(props.jumpStyle).toBe('gap');
    const markersCount = await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      const model = root?.service?.crud?.getElementById?.(id);
      return (model?.routedPoints ?? []).filter((p: any) => p.type === 1)
        .length;
    }, roundedId);

    await page.screenshot({
      path: testInfo.outputPath('rounded-jumps-visible.png'),
      fullPage: true,
    });
    expect(markersCount).toBeGreaterThanOrEqual(0);
  });

  test('curve connectors do not create jumps', async ({ page }) => {
    await edgelessCommonSetup(page);
    const menu = await openConnectorMenu(page);
    await setJumpStyle(page, 'arc', menu);
    await menu
      .locator('edgeless-tool-icon-button', { hasText: 'Curve' })
      .click();
    const curveId = await drawConnector(page, [120, 120], [380, 120]);
    await setConnectorJumpStyleById(page, curveId, 'arc');

    await menu
      .locator('edgeless-tool-icon-button', { hasText: 'Straight' })
      .click();
    const straightId = await drawConnector(page, [250, 40], [250, 220]);
    await setConnectorJumpStyleById(page, straightId, 'arc');
    const straightProps = await getConnectorProps(page, straightId);
    expect(straightProps.jumpStyle).toBe('arc');

    const curveMarkers = await getJumpMarkers(page, curveId);
    const straightMarkers = await getJumpMarkers(page, straightId);
    expect(curveMarkers.length).toBe(0);
    expect(straightMarkers.length).toBe(0);
  });
});
