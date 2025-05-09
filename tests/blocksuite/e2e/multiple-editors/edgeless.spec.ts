import { expect } from '@playwright/test';

import {
  switchMultipleEditorsMode,
  toggleMultipleEditors,
} from '../utils/actions/edgeless.js';
import {
  enterPlaygroundRoom,
  initEmptyEdgelessState,
  initThreeParagraphs,
  waitNextFrame,
} from '../utils/actions/misc.js';
import { test } from '../utils/playwright.js';

test('the shift pressing status should effect all editors', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await initThreeParagraphs(page);
  await toggleMultipleEditors(page);
  await switchMultipleEditorsMode(page);

  await waitNextFrame(page, 5000);

  const getShiftPressedStatus = async () => {
    return page.evaluate(() => {
      const edgelessBlocks = document.querySelectorAll('affine-edgeless-root');

      return Array.from(edgelessBlocks).map(edgelessRoot => {
        return edgelessRoot.gfx.keyboard.shiftKey$.peek();
      });
    });
  };

  await page.keyboard.down('Shift');
  const pressed = await getShiftPressedStatus();
  expect(pressed).toEqual([true, true]);

  await page.keyboard.up('Shift');
  const released = await getShiftPressedStatus();
  expect(released).toEqual([false, false]);
});
