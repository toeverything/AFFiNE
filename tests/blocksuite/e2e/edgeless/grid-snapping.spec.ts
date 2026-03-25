import { expect, type Page } from '@playwright/test';

import {
  createConnectorElement,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  getConnectorSourceConnection,
  getEdgelessElementBound,
  resizeConnectorByStartCapitalHandler,
  setEdgelessTool,
  ZOOM_BAR_RESPONSIVE_SCREEN_WIDTH,
} from '../utils/actions/edgeless.js';
import { test } from '../utils/playwright.js';

const GRID_VISIBILITY_KEY = 'blocksuite:edgeless:showGrid';
const GRID_SIZE_KEY = 'blocksuite:edgeless:gridSize';
const SNAP_TO_GRID_KEY = 'blocksuite:edgeless:snapToGrid';
const SNAP_TO_GUIDES_KEY = 'blocksuite:edgeless:snapToGuides';
const SNAP_CONNECTOR_TO_GRID_KEY = 'blocksuite:edgeless:connectorSnapToGrid';

async function getStorageValue(page: Page, key: string) {
  return page.evaluate(keyName => localStorage.getItem(keyName), key);
}

async function getGridState(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    return {
      gridVisible: root._gridVisible,
      gridSize: root._gridSize,
    };
  });
}

async function getConnectorConnections(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const connector = root.service.crud.getElementsByType('connector')[0];
    if (!connector) throw new Error('connector not found');
    return {
      source: connector.source,
      target: connector.target,
    };
  });
}

function isAlignedToGrid(value: number, gridSize: number) {
  const remainder = Math.abs(value % gridSize);
  return remainder < 0.5 || gridSize - remainder < 0.5;
}

async function getBackgroundImage(page: Page) {
  return page.evaluate(() => {
    const background = document.querySelector(
      '.edgeless-background'
    ) as HTMLElement | null;
    if (!background) throw new Error('background not found');
    return window.getComputedStyle(background).backgroundImage;
  });
}

async function createShapeWithId(page: Page) {
  const shapeId = await page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    return root.service.crud.addElement('shape', {
      shapeType: 'rect',
      xywh: JSON.stringify([100, 100, 80, 50]),
      radius: 0,
    });
  });
  await page.waitForTimeout(50);
  return shapeId as string | undefined;
}

async function createShapeAt(
  page: Page,
  xywh: [number, number, number, number]
) {
  const shapeId = await page.evaluate(coords => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    return root.service.crud.addElement('shape', {
      shapeType: 'rect',
      xywh: JSON.stringify(coords),
      radius: 0,
    });
  }, xywh);
  await page.waitForTimeout(50);
  return shapeId as string;
}

async function getGridMenuTrigger(page: Page) {
  const currentSize = page.viewportSize();
  if (
    !currentSize ||
    currentSize.width < ZOOM_BAR_RESPONSIVE_SCREEN_WIDTH + 1
  ) {
    await page.setViewportSize({
      width: ZOOM_BAR_RESPONSIVE_SCREEN_WIDTH + 200,
      height: currentSize?.height ?? 900,
    });
  }

  const gridMenu = page.locator('edgeless-grid-menu').first();
  await expect(gridMenu).toBeVisible();

  const gridButton = gridMenu
    .locator('button[title="Grid & Snap Settings"]')
    .first();
  await expect(gridButton).toBeVisible();
  return gridButton;
}

test.describe('grid menu', () => {
  test('grid menu opens and shows options', async ({ page }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();

    const menu = page.locator('.grid-menu-dropdown');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Show Grid')).toBeVisible();
    await expect(menu.getByText('Grid Size')).toBeVisible();
    await expect(menu.getByText('Snap', { exact: true })).toBeVisible();

    await page.mouse.click(0, 0);
    await expect(menu).toBeHidden();
  });

  test('grid menu renders in vertical toolbar layout', async ({ page }) => {
    await edgelessCommonSetup(page);

    const toolbar = page.locator('edgeless-zoom-toolbar');
    await toolbar.evaluate(el => ((el as any).layout = 'vertical'));

    const verticalContainer = toolbar.locator(
      '.edgeless-zoom-toolbar-container.vertical'
    );
    await expect(verticalContainer).toBeVisible();

    const gridButton = await getGridMenuTrigger(page);
    await expect(gridButton).toBeVisible();
  });

  test('grid menu toggles update stored settings', async ({ page }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();

    const menu = page.locator('.grid-menu-dropdown');
    const showGrid = menu.getByLabel('Show Grid');
    const snapToGrid = menu.getByLabel('Snap shape to grid');
    const snapToGuides = menu.getByLabel('Snap to guides');
    const snapConnectorToGrid = menu.getByLabel('Snap connector to grid');

    const showGridBefore = await showGrid.isChecked();
    await showGrid.click();
    const showGridStored = await getStorageValue(page, GRID_VISIBILITY_KEY);
    const gridStateAfterToggle = await getGridState(page);
    expect(showGridStored).not.toBeNull();
    expect(JSON.parse(showGridStored!)).toBe(!showGridBefore);
    expect(gridStateAfterToggle.gridVisible).toBe(!showGridBefore);

    const snapToGridBefore = await snapToGrid.isChecked();
    await snapToGrid.click();
    const snapToGridStored = await getStorageValue(page, SNAP_TO_GRID_KEY);
    expect(snapToGridStored).not.toBeNull();
    expect(JSON.parse(snapToGridStored!)).toBe(!snapToGridBefore);

    const snapToGuidesBefore = await snapToGuides.isChecked();
    await snapToGuides.click();
    const snapToGuidesStored = await getStorageValue(page, SNAP_TO_GUIDES_KEY);
    expect(snapToGuidesStored).not.toBeNull();
    expect(JSON.parse(snapToGuidesStored!)).toBe(!snapToGuidesBefore);

    const snapConnectorBefore = await snapConnectorToGrid.isChecked();
    await snapConnectorToGrid.click();
    const snapConnectorStored = await getStorageValue(
      page,
      SNAP_CONNECTOR_TO_GRID_KEY
    );
    expect(snapConnectorStored).not.toBeNull();
    expect(JSON.parse(snapConnectorStored!)).toBe(!snapConnectorBefore);
  });

  test('grid visibility toggle updates background grid', async ({ page }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();

    const menu = page.locator('.grid-menu-dropdown');
    const showGrid = menu.getByLabel('Show Grid');

    if (await showGrid.isChecked()) {
      await showGrid.uncheck();
      await expect.poll(async () => getBackgroundImage(page)).toBe('none');
      await showGrid.check();
    } else {
      await showGrid.check();
    }

    await expect.poll(async () => getBackgroundImage(page)).not.toBe('none');
  });

  test('grid size presets and custom input update grid size', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();

    const menu = page.locator('.grid-menu-dropdown');
    const size50 = menu.getByRole('button', { name: '50px' });
    await size50.click();

    const gridSizeStored = await getStorageValue(page, GRID_SIZE_KEY);
    const gridState = await getGridState(page);
    expect(gridSizeStored).not.toBeNull();
    expect(JSON.parse(gridSizeStored!)).toBe(50);
    expect(gridState.gridSize).toBe(50);

    const customInput = menu.locator('input.grid-size-custom');
    await customInput.fill('60');

    const customStored = await getStorageValue(page, GRID_SIZE_KEY);
    const customState = await getGridState(page);
    expect(customStored).not.toBeNull();
    expect(JSON.parse(customStored!)).toBe(60);
    expect(customState.gridSize).toBe(60);
  });

  test('snap to grid aligns shapes to grid intersections', async ({ page }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();

    const menu = page.locator('.grid-menu-dropdown');
    const snapToGrid = menu.getByLabel('Snap shape to grid');
    const snapToGuides = menu.getByLabel('Snap to guides');
    const size50 = menu.getByRole('button', { name: '50px' });
    if (!(await snapToGrid.isChecked())) {
      await snapToGrid.click();
    }
    if (await snapToGuides.isChecked()) {
      await snapToGuides.click();
    }
    await size50.click();
    await page.mouse.click(0, 0);

    const shapeId = await createShapeWithId(page);
    expect(shapeId).toBeTruthy();
    const [x, y, w, h] = await getEdgelessElementBound(page, shapeId);
    const startCenter: [number, number] = [x + w / 2, y + h / 2];
    const targetCenter: [number, number] = [
      startCenter[0] + 47,
      startCenter[1] + 47,
    ];

    await setEdgelessTool(page, 'default');
    await dragBetweenViewCoords(page, startCenter, targetCenter, {
      steps: 10,
      click: true,
    });

    const [nextX, nextY] = await getEdgelessElementBound(page, shapeId);
    expect(isAlignedToGrid(nextX, 50)).toBe(true);
    expect(isAlignedToGrid(nextY, 50)).toBe(true);
  });

  test('disabling snap to grid allows off-grid placement', async ({ page }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();

    const menu = page.locator('.grid-menu-dropdown');
    const snapToGrid = menu.getByLabel('Snap shape to grid');
    const snapToGuides = menu.getByLabel('Snap to guides');
    const size50 = menu.getByRole('button', { name: '50px' });
    if (await snapToGrid.isChecked()) {
      await snapToGrid.click();
    }
    if (await snapToGuides.isChecked()) {
      await snapToGuides.click();
    }
    await size50.click();
    await page.mouse.click(0, 0);

    const shapeId = await createShapeWithId(page);
    expect(shapeId).toBeTruthy();
    const [x, y, w, h] = await getEdgelessElementBound(page, shapeId);
    const startCenter: [number, number] = [x + w / 2, y + h / 2];
    const targetCenter: [number, number] = [
      startCenter[0] + 120,
      startCenter[1] + 120,
    ];

    await setEdgelessTool(page, 'default');
    await dragBetweenViewCoords(page, startCenter, targetCenter, {
      steps: 10,
      click: true,
    });

    const [nextX, nextY] = await getEdgelessElementBound(page, shapeId);
    expect(isAlignedToGrid(nextX, 50)).toBe(false);
    expect(isAlignedToGrid(nextY, 50)).toBe(false);
  });

  test('snap to guides aligns shapes when enabled', async ({ page }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();
    const menu = page.locator('.grid-menu-dropdown');
    const snapToGrid = menu.getByLabel('Snap shape to grid');
    const snapToGuides = menu.getByLabel('Snap to guides');
    if (await snapToGrid.isChecked()) {
      await snapToGrid.click();
    }
    if (!(await snapToGuides.isChecked())) {
      await snapToGuides.click();
    }
    await page.mouse.click(0, 0);

    const anchorId = await createShapeAt(page, [100, 100, 80, 60]);
    const movingId = await createShapeAt(page, [260, 100, 80, 60]);

    const [anchorX] = await getEdgelessElementBound(page, anchorId);
    const [movingX, movingY, movingW, movingH] = await getEdgelessElementBound(
      page,
      movingId
    );
    const startCenter: [number, number] = [
      movingX + movingW / 2,
      movingY + movingH / 2,
    ];
    const targetLeft = anchorX + 4;
    const targetCenter: [number, number] = [
      targetLeft + movingW / 2,
      startCenter[1],
    ];

    await setEdgelessTool(page, 'default');
    await dragBetweenViewCoords(page, startCenter, targetCenter, {
      steps: 10,
      click: true,
    });

    const [snappedX] = await getEdgelessElementBound(page, movingId);
    expect(Math.abs(snappedX - anchorX)).toBeLessThan(1);
  });

  test('snap connector to grid aligns endpoint to grid', async ({ page }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();
    const menu = page.locator('.grid-menu-dropdown');
    const snapConnectorToGrid = menu.getByLabel('Snap connector to grid');
    const snapToGrid = menu.getByLabel('Snap shape to grid');
    const size50 = menu.getByRole('button', { name: '50px' });
    if (!(await snapConnectorToGrid.isChecked())) {
      await snapConnectorToGrid.click();
    }
    if (await snapToGrid.isChecked()) {
      await snapToGrid.click();
    }
    await size50.click();
    await page.mouse.click(0, 0);

    await createConnectorElement(page, [0, 0], [200, 0]);
    await resizeConnectorByStartCapitalHandler(page, { x: 37, y: 22 }, 5);

    const source = await getConnectorSourceConnection(page);
    const [sourceX, sourceY] = source.position;
    expect(isAlignedToGrid(sourceX, 50)).toBe(true);
    expect(isAlignedToGrid(sourceY, 50)).toBe(true);
  });

  test('dragging connector endpoint snaps without moving the other endpoint', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();
    const menu = page.locator('.grid-menu-dropdown');
    const snapConnectorToGrid = menu.getByLabel('Snap connector to grid');
    const snapToGuides = menu.getByLabel('Snap to guides');
    const size50 = menu.getByRole('button', { name: '50px' });
    if (!(await snapConnectorToGrid.isChecked())) {
      await snapConnectorToGrid.click();
    }
    if (await snapToGuides.isChecked()) {
      await snapToGuides.click();
    }
    await size50.click();
    await page.mouse.click(0, 0);

    await createConnectorElement(page, [23, 37], [177, 91]);
    const before = await getConnectorConnections(page);
    const beforeTarget = before.target.position as [number, number];
    const beforeSource = before.source.position as [number, number];

    await dragBetweenViewCoords(page, beforeSource, [97, 103], {
      steps: 10,
      click: true,
    });

    const after = await getConnectorConnections(page);
    const afterSource = after.source.position as [number, number];
    const afterTarget = after.target.position as [number, number];

    expect(isAlignedToGrid(afterSource[0], 50)).toBe(true);
    expect(isAlignedToGrid(afterSource[1], 50)).toBe(true);
    expect(Math.abs(afterTarget[0] - beforeTarget[0])).toBeLessThan(0.5);
    expect(Math.abs(afterTarget[1] - beforeTarget[1])).toBeLessThan(0.5);
  });

  test('snap-to-grid does not block snapping to edge nodes', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);

    const gridButton = await getGridMenuTrigger(page);
    await gridButton.click();
    const menu = page.locator('.grid-menu-dropdown');
    const snapConnectorToGrid = menu.getByLabel('Snap connector to grid');
    const snapToGuides = menu.getByLabel('Snap to guides');
    const size50 = menu.getByRole('button', { name: '50px' });
    if (!(await snapConnectorToGrid.isChecked())) {
      await snapConnectorToGrid.click();
    }
    if (await snapToGuides.isChecked()) {
      await snapToGuides.click();
    }
    await size50.click();
    await page.mouse.click(0, 0);

    const shapeId = await createShapeAt(page, [118, 110, 73, 60]);
    await createConnectorElement(page, [0, 0], [60, 0]);

    const targetPoint: [number, number] = [118 + 73, 110 + 60 / 2];
    const connections = await getConnectorConnections(page);
    const targetStart = connections.target.position as [number, number];

    await dragBetweenViewCoords(page, targetStart, targetPoint, {
      steps: 10,
      click: true,
    });

    const after = await getConnectorConnections(page);
    expect(after.target.id).toBe(shapeId);
  });
});
