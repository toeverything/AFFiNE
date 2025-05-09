import { expect } from '@playwright/test';

import {
  copyByKeyboard,
  createConnectorElement,
  createNote,
  createShapeElement,
  edgelessCommonSetup as commonSetup,
  getAllSortedIds,
  getTypeById,
  pasteByKeyboard,
  selectAllByKeyboard,
  Shape,
  toViewCoord,
  triggerComponentToolbarAction,
  waitNextFrame,
} from '../../utils/actions/index.js';
import { assertConnectorPath } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test.describe('connector clipboard', () => {
  test('copy and paste connector whose both sides connect nothing', async ({
    page,
  }) => {
    await commonSetup(page);
    await createConnectorElement(page, [0, 0], [200, 100]);
    await waitNextFrame(page);
    await copyByKeyboard(page);
    const move = await toViewCoord(page, [100, -50]);
    await page.mouse.click(move[0], move[1]);
    await pasteByKeyboard(page, false);
    await waitNextFrame(page);
    await assertConnectorPath(
      page,
      [
        [0, -100],
        [100, -100],
        [100, 0],
        [200, 0],
      ],
      1
    );
  });

  test('copy and paste connector whose both sides connect elements', async ({
    page,
  }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    await createConnectorElement(page, [60, 50], [240, 50]);

    await selectAllByKeyboard(page);
    await copyByKeyboard(page);
    const move = await toViewCoord(page, [150, -50]);
    await page.mouse.click(move[0], move[1]);
    await pasteByKeyboard(page, false);
    await waitNextFrame(page);
    await assertConnectorPath(
      page,
      [
        [100, -50],
        [200, -50],
      ],
      1
    );
  });

  test('copy and paste connector whose both sides connect elements, but only paste connector', async ({
    page,
  }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    await createConnectorElement(page, [70, 50], [230, 50]);

    await copyByKeyboard(page);
    const move = await toViewCoord(page, [150, -50]);
    await page.mouse.move(move[0], move[1]);
    await pasteByKeyboard(page, false);
    await waitNextFrame(page);
    await assertConnectorPath(
      page,
      [
        [100, -50],
        [200, -50],
      ],
      1
    );
  });

  test('copy and paste connector whose one side connects elements', async ({
    page,
  }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createConnectorElement(page, [55, 50], [200, 50]);

    await selectAllByKeyboard(page);
    await copyByKeyboard(page);
    const move = await toViewCoord(page, [100, -50]);
    await page.mouse.click(move[0], move[1]);
    await pasteByKeyboard(page, false);
    await assertConnectorPath(
      page,
      [
        [100, -50],
        [200, -50],
      ],
      1
    );
  });

  test('original relative index should keep same when copy and paste group with note and shape', async ({
    page,
  }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createNote(page, [100, 50]);
    await page.mouse.click(10, 50);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');
    await copyByKeyboard(page);
    const move = await toViewCoord(page, [250, 250]);
    await page.mouse.move(move[0], move[1]);
    await page.mouse.click(move[0], move[1]);
    await pasteByKeyboard(page, true);
    await waitNextFrame(page, 500);

    const sortedIds = await getAllSortedIds(page);
    expect(sortedIds.length).toBe(6);
    expect(await getTypeById(page, sortedIds[0])).toBe(
      await getTypeById(page, sortedIds[3])
    );
    expect(await getTypeById(page, sortedIds[1])).toBe(
      await getTypeById(page, sortedIds[4])
    );
    expect(await getTypeById(page, sortedIds[2])).toBe(
      await getTypeById(page, sortedIds[5])
    );
  });
});
