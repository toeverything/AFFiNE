import type { Page } from '@playwright/test';

import { clickView } from '../../utils/actions/click.js';
import {
  createFrame,
  dragBetweenViewCoords as _dragBetweenViewCoords,
  edgelessCommonSetup,
  getFirstContainerId,
  getSelectedBound,
  toViewCoord,
  triggerComponentToolbarAction,
  zoomResetByKeyboard,
} from '../../utils/actions/edgeless.js';
import { pressEscape } from '../../utils/actions/keyboard.js';
import { waitNextFrame } from '../../utils/actions/misc.js';
import { assertContainerOfElements } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

const dragBetweenViewCoords = async (
  page: Page,
  start: number[],
  end: number[]
) => {
  // dragging slowly may drop frame if mindmap is existed, so for test we drag quickly
  await _dragBetweenViewCoords(page, start, end, { steps: 10 });
  await waitNextFrame(page);
};

test.beforeEach(async ({ page }) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);
});

test('drag root node of mindmap into frame partially, then drag root node of mindmap out.', async ({
  page,
}) => {
  await createFrame(page, [50, 50], [550, 550]);
  await pressEscape(page);
  const frameId = await getFirstContainerId(page);

  await triggerComponentToolbarAction(page, 'addMindmap');
  const mindmapId = await getFirstContainerId(page, [frameId]);

  // drag in
  {
    const mindmapBound = await getSelectedBound(page);
    await clickView(page, [
      mindmapBound[0] + 10,
      mindmapBound[1] + 0.5 * mindmapBound[3],
    ]);
    await dragBetweenViewCoords(
      page,
      [mindmapBound[0] + 10, mindmapBound[1] + 0.5 * mindmapBound[3]],
      [100, 100]
    );
  }

  await assertContainerOfElements(page, [mindmapId], frameId);

  // drag out
  {
    const mindmapBound = await getSelectedBound(page);
    await clickView(page, [
      mindmapBound[0] + 10,
      mindmapBound[1] + 0.5 * mindmapBound[3],
    ]);
    await dragBetweenViewCoords(
      page,
      [mindmapBound[0] + 10, mindmapBound[1] + 0.5 * mindmapBound[3]],
      [-100, -100]
    );
  }

  await assertContainerOfElements(page, [mindmapId], null);
});

test('drag root node of mindmap into frame fully, then drag root node of mindmap out.', async ({
  page,
}) => {
  await createFrame(page, [50, 50], [550, 550]);
  const frameId = await getFirstContainerId(page);
  await pressEscape(page);

  await triggerComponentToolbarAction(page, 'addMindmap');
  const mindmapId = await getFirstContainerId(page, [frameId]);

  // drag in
  {
    const mindmapBound = await getSelectedBound(page);

    await clickView(page, [
      mindmapBound[0] + 10,
      mindmapBound[1] + 0.5 * mindmapBound[3],
    ]);
    await dragBetweenViewCoords(
      page,
      [mindmapBound[0] + 10, mindmapBound[1] + 0.5 * mindmapBound[3]],
      [100, 200]
    );
  }

  await assertContainerOfElements(page, [mindmapId], frameId);

  // drag out
  {
    const mindmapBound = await getSelectedBound(page);
    await clickView(page, [
      mindmapBound[0] + 10,
      mindmapBound[1] + 0.5 * mindmapBound[3],
    ]);
    await dragBetweenViewCoords(
      page,
      [mindmapBound[0] + 10, mindmapBound[1] + 0.5 * mindmapBound[3]],
      [-100, -100]
    );
  }

  await assertContainerOfElements(page, [mindmapId], null);
});

test('drag whole mindmap into frame, then drag root node of mindmap out.', async ({
  page,
}) => {
  await createFrame(page, [50, 50], [550, 550]);
  const frameId = await getFirstContainerId(page);
  await pressEscape(page);

  await triggerComponentToolbarAction(page, 'addMindmap');
  const mindmapId = await getFirstContainerId(page, [frameId]);

  // drag in
  {
    const mindmapBound = await getSelectedBound(page);
    const rootNodePos = [
      mindmapBound[0] + 10,
      mindmapBound[1] + 0.5 * mindmapBound[3],
    ];
    await dragBetweenViewCoords(page, rootNodePos, [
      rootNodePos[0] - 20,
      rootNodePos[1] + 200,
    ]);
  }

  await assertContainerOfElements(page, [mindmapId], frameId);

  // drag out
  {
    const mindmapBound = await getSelectedBound(page);
    const rootNodePos = [
      mindmapBound[0] + 10,
      mindmapBound[1] + 0.5 * mindmapBound[3],
    ];

    await dragBetweenViewCoords(page, rootNodePos, [-100, -100]);
  }

  await assertContainerOfElements(page, [mindmapId], null);
});

test('add mindmap into frame, then drag root node of mindmap out.', async ({
  page,
}) => {
  await createFrame(page, [50, 50], [550, 550]);
  const frameId = await getFirstContainerId(page);
  await pressEscape(page);

  const button = page.locator('edgeless-mindmap-tool-button');
  await button.click();
  const mindMapMenu = page.locator('edgeless-mindmap-menu');
  const mindMapItem = mindMapMenu.locator('.mindmap-item').first();
  await mindMapItem.click();
  await toViewCoord(page, [100, 200]);
  await clickView(page, [100, 200]);
  const mindmapId = await getFirstContainerId(page, [frameId]);

  await assertContainerOfElements(page, [mindmapId], frameId);

  // drag out
  {
    const mindmapBound = await getSelectedBound(page);
    await pressEscape(page);
    await clickView(page, [
      mindmapBound[0] + 10,
      mindmapBound[1] + 0.5 * mindmapBound[3],
    ]);
    await dragBetweenViewCoords(
      page,
      [mindmapBound[0] + 10, mindmapBound[1] + 0.5 * mindmapBound[3]],
      [-20, -20]
    );
  }

  await assertContainerOfElements(page, [mindmapId], null);
});

test('add mindmap out of frame and add new node in frame then drag frame', async ({
  page,
}) => {
  await createFrame(page, [500, 50], [1000, 550]);
  await pressEscape(page);

  const button = page.locator('edgeless-mindmap-tool-button');
  await button.click();
  const mindMapMenu = page.locator('edgeless-mindmap-menu');
  const mindMapItem = mindMapMenu.locator('.mindmap-item').first();
  await mindMapItem.click();
  await toViewCoord(page, [20, 200]);
  await clickView(page, [20, 200]);
  await waitNextFrame(page, 100);
  const mindmapId = await getFirstContainerId(page);

  // add new node
  {
    const mindmapBound = await getSelectedBound(page);
    await pressEscape(page);
    await waitNextFrame(page, 500);
    await clickView(page, [
      mindmapBound[2] - 50,
      mindmapBound[1] + 0.5 * mindmapBound[3],
    ]);
    await waitNextFrame(page, 500);
    await clickView(page, [
      mindmapBound[2] + 10,
      mindmapBound[1] + 0.5 * mindmapBound[3],
    ]);
    await pressEscape(page, 2);
  }

  await assertContainerOfElements(page, [mindmapId], null);
});
