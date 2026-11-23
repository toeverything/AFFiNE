import { expect } from '@playwright/test';

import { clickView } from '../utils/actions/click.js';
import {
  addBasicRectShapeElement,
  getSelectedBoundCount,
  locatorComponentToolbar,
  resizeElementByHandle,
  selectNoteInEdgeless,
  switchEditorMode,
  zoomResetByKeyboard,
} from '../utils/actions/edgeless.js';
import {
  pressBackspace,
  selectAllBlocksByKeyboard,
} from '../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  initEmptyEdgelessState,
} from '../utils/actions/misc.js';
import { test } from '../utils/playwright.js';

test('toolbar should appear when select note', async ({ page }) => {
  await enterPlaygroundRoom(page);
  const { noteId } = await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  await selectNoteInEdgeless(page, noteId);

  const toolbar = locatorComponentToolbar(page);
  await expect(toolbar).toBeVisible();
});

test('tooltip should be hidden after clicking on button', async ({ page }) => {
  await enterPlaygroundRoom(page);
  const { noteId } = await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  await selectNoteInEdgeless(page, noteId);

  const toolbar = locatorComponentToolbar(page);
  const modeBtn = toolbar.getByRole('button', { name: 'Mode' });

  await modeBtn.hover();
  await expect(page.locator('.blocksuite-portal')).toBeVisible();

  await modeBtn.click();
  await expect(page.locator('.blocksuite-portal')).toBeHidden();
  await expect(page.locator('note-display-mode-panel')).toBeVisible();

  await modeBtn.click();
  await expect(page.locator('.blocksuite-portal')).toBeVisible();
  await expect(page.locator('note-display-mode-panel')).toBeHidden();

  await modeBtn.click();
  await expect(page.locator('.blocksuite-portal')).toBeHidden();
  await expect(page.locator('note-display-mode-panel')).toBeVisible();

  const colorBtn = toolbar.getByRole('button', {
    name: 'Note Style',
  });

  await colorBtn.hover();
  await expect(page.locator('.blocksuite-portal')).toBeVisible();

  await colorBtn.click();
  await expect(page.locator('.blocksuite-portal')).toBeHidden();
  await expect(page.locator('note-display-mode-panel')).toBeHidden();
  await expect(page.locator('edgeless-color-panel')).toBeVisible();
});

test('should be hidden when resizing element', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  await addBasicRectShapeElement(page, { x: 210, y: 110 }, { x: 310, y: 210 });
  await page.mouse.click(220, 120);

  const toolbar = locatorComponentToolbar(page);
  await expect(toolbar).toBeVisible();

  await resizeElementByHandle(
    page,
    { x: 400, y: 300 },
    'top-left',
    30,
    async () => {
      await expect(toolbar).toBeHidden();
    }
  );

  await expect(toolbar).toBeVisible();
});

test('should only one tool active at the same time when using shortcut to switch tool', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await clickView(page, [0, 0]);
  await selectAllBlocksByKeyboard(page);
  await pressBackspace(page);

  await page.keyboard.press('s');
  await page.keyboard.press('m');
  await page.keyboard.press('n');

  await clickView(page, [100, 100]);
  await clickView(page, [0, 0]); // click on empty space to deselect the note
  await selectAllBlocksByKeyboard(page);
  expect(
    await getSelectedBoundCount(page),
    'only a note should be created'
  ).toBe(1);
});
