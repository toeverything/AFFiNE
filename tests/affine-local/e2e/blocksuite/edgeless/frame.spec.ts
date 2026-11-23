import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickView,
  createEdgelessNoteBlock,
  dragView,
  locateEditorContainer,
  locateToolbar,
  toViewCoord,
} from '@affine-test/kit/utils/editor';
import {
  pressBackspace,
  pressEscape,
  selectAllByKeyboard,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickEdgelessModeButton(page);
  const container = locateEditorContainer(page);
  await container.click();
  await selectAllByKeyboard(page);
  await pressBackspace(page);
});

test('should update zindex of element when moving it into frame', async ({
  page,
}) => {
  const toolbar = locateToolbar(page);

  // create a top frame
  await page.keyboard.press('f');
  await dragView(page, [0, 100], [300, 400]);
  await toolbar.getByLabel('Background').click();
  await toolbar.getByLabel('LightRed').click();
  await pressEscape(page);

  // create a note
  await createEdgelessNoteBlock(page, [500, 500]);
  await clickView(page, [0, 100]);
  await clickView(page, [500, 500]);
  await toolbar.getByLabel('More menu').click();
  await toolbar.getByLabel('Send to Back').click();
  await pressEscape(page);

  await dragView(page, [500, 500], [100, 200]);

  const point = await toViewCoord(page, [100, 200]);

  const isNoteAboveFrame = await page.evaluate(point => {
    return !!document
      .elementFromPoint(point[0], point[1])
      ?.closest('affine-edgeless-note');
  }, point);
  expect(isNoteAboveFrame).toBe(true);
});
