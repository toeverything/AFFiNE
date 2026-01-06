import { expect } from '@playwright/test';

import { addNote, switchEditorMode } from './utils/actions/edgeless.js';
import {
  pressArrowDown,
  pressArrowLeft,
  pressArrowRight,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  pressEscape,
  pressShiftEnter,
  pressShiftTab,
  pressTab,
  redoByKeyboard,
  SHORT_KEY,
  type,
  undoByKeyboard,
} from './utils/actions/keyboard.js';
import {
  captureHistory,
  enterPlaygroundRoom,
  focusRichText,
  getInlineSelectionText,
  getPageSnapshot,
  getSelectionRect,
  initEmptyEdgelessState,
  initEmptyParagraphState,
  insertThreeLevelLists,
  waitNextFrame,
} from './utils/actions/misc.js';
import {
  assertAlmostEqual,
  assertBlockCount,
  assertRichTexts,
} from './utils/asserts.js';
import { test } from './utils/playwright.js';

function formatWithTimezone(date: Date, timeZone: string = 'Asia/Tokyo') {
  const tokyoDate = date.toLocaleString('en-US', { timeZone });
  const year = tokyoDate.split(',')[0].split('/')[2];
  const month = tokyoDate.split(',')[0].split('/')[0].padStart(2, '0');
  const day = tokyoDate.split(',')[0].split('/')[1].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test.describe('slash menu should show and hide correctly', () => {
  test.beforeEach(async ({ page }) => {
    await enterPlaygroundRoom(page);
  });

  test("slash menu should show when user input '/'", async ({ page }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();
  });

  // Playwright dose not support IME
  // https://github.com/microsoft/playwright/issues/5777
  test.skip("slash menu should show when user input '、'", async ({ page }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '、');

    await expect(slashMenu).toBeVisible();
  });

  test('slash menu should hide after click away', async ({
    page,
  }, testInfo) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();
    // Click outside should close slash menu
    await page.mouse.click(0, 50);
    await expect(slashMenu).toBeHidden();

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}.json`
    );
  });

  test('slash menu should hide after input whitespace', async ({ page }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();
    await type(page, ' ');
    await expect(slashMenu).toBeHidden();
    await assertRichTexts(page, ['/ ']);
    await pressBackspace(page);
    await expect(slashMenu).toBeVisible();

    await type(page, 'head');
    await expect(slashMenu).toBeVisible();
    await type(page, ' ');
    await expect(slashMenu).toBeHidden();
    await pressBackspace(page);
    await expect(slashMenu).toBeVisible();
  });

  test('delete the slash symbol should close the slash menu', async ({
    page,
  }, testInfo) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    await pressBackspace(page);
    await expect(slashMenu).toBeHidden();
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}.json`
    );
  });

  test('typing something that does not match should close the slash menu', async ({
    page,
  }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    await type(page, '_');
    await expect(slashMenu).toBeHidden();
    await assertRichTexts(page, ['/_']);

    // And pressing backspace immediately should reappear the slash menu
    await pressBackspace(page);
    await expect(slashMenu).toBeVisible();

    await type(page, '__');
    await pressBackspace(page);
    await expect(slashMenu).toBeHidden();
  });

  test('pressing the slash key again should close the old slash menu and open new one', async ({
    page,
  }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    await type(page, '/');
    await expect(slashMenu).toBeVisible();
    await expect(slashMenu).toHaveCount(1);
    await assertRichTexts(page, ['//']);
  });

  test('should position slash menu correctly', async ({ page }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    const box = await slashMenu.boundingBox();
    if (!box) {
      throw new Error("slashMenu doesn't exist");
    }
    const rect = await getSelectionRect(page);
    const { x, y } = box;
    assertAlmostEqual(x - rect.x, 0, 10);
    assertAlmostEqual(y - rect.bottom, 5, 10);
  });

  test('should move up down with arrow key', async ({ page }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    const slashItems = slashMenu.locator('icon-button');

    await pressArrowDown(page);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.nth(1)).toHaveAttribute('hover', 'true');
    await expect(slashItems.nth(1).locator('.text')).toHaveText(['Heading 1']);
    await assertRichTexts(page, ['/']);

    await pressArrowUp(page);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.first()).toHaveAttribute('hover', 'true');
    await expect(slashItems.first().locator('.text')).toHaveText(['Text']);
    await assertRichTexts(page, ['/']);

    await pressArrowUp(page);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.last()).toHaveAttribute('hover', 'true');
    await expect(slashItems.last().locator('.text')).toHaveText(['Delete']);
    await assertRichTexts(page, ['/']);

    await pressArrowDown(page);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.first()).toHaveAttribute('hover', 'true');
    await expect(slashItems.first().locator('.text')).toHaveText(['Text']);
    await assertRichTexts(page, ['/']);
  });

  test('slash menu hover state', async ({ page }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    const slashItems = slashMenu.locator('icon-button');

    await pressArrowDown(page);
    await expect(slashItems.nth(1)).toHaveAttribute('hover', 'true');

    await pressArrowUp(page);
    await expect(slashItems.nth(1)).toHaveAttribute('hover', 'false');
    await expect(slashItems.nth(0)).toHaveAttribute('hover', 'true');

    await pressArrowDown(page);
    await pressArrowDown(page);
    await expect(slashItems.nth(2)).toHaveAttribute('hover', 'true');
    await expect(slashItems.nth(1)).toHaveAttribute('hover', 'false');
    await expect(slashItems.nth(0)).toHaveAttribute('hover', 'false');

    await slashItems.nth(0).hover();
    await expect(slashItems.nth(0)).toHaveAttribute('hover', 'true');
    await expect(slashItems.nth(2)).toHaveAttribute('hover', 'false');
    await expect(slashItems.nth(1)).toHaveAttribute('hover', 'false');
  });

  test('should open tooltip when hover on item', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '/');
    const slashMenu = page.locator(`.slash-menu`);
    await expect(slashMenu).toBeVisible();

    const slashItems = slashMenu.locator('icon-button');
    const tooltip = page.locator('.affine-tooltip');

    await slashItems.nth(0).hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator('.tooltip-caption')).toHaveText(['Text']);
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();

    await slashItems.nth(1).hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator('.tooltip-caption')).toHaveText([
      'Heading #1',
    ]);
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();

    await expect(slashItems.nth(4).locator('.text')).toHaveText([
      'Other Headings',
    ]);
    await slashItems.nth(4).hover();
    await expect(tooltip).toBeHidden();
  });

  test('press tab should move up and down', async ({ page }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    const slashItems = slashMenu.locator('icon-button');

    await pressTab(page);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.nth(1)).toHaveAttribute('hover', 'true');
    await expect(slashItems.nth(1).locator('.text')).toHaveText(['Heading 1']);
    await assertRichTexts(page, ['/']);

    await pressShiftTab(page);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.first()).toHaveAttribute('hover', 'true');
    await expect(slashItems.first().locator('.text')).toHaveText(['Text']);
    await assertRichTexts(page, ['/']);

    await pressShiftTab(page);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.last()).toHaveAttribute('hover', 'true');
    await expect(slashItems.last().locator('.text')).toHaveText(['Delete']);
    await assertRichTexts(page, ['/']);

    await pressTab(page);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.first()).toHaveAttribute('hover', 'true');
    await expect(slashItems.first().locator('.text')).toHaveText(['Text']);
    await assertRichTexts(page, ['/']);
  });

  test('should move up down with ctrl/cmd+n and ctrl/cmd+p', async ({
    page,
  }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    const slashItems = slashMenu.locator('icon-button');

    await page.keyboard.press(`${SHORT_KEY}+n`);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.nth(1)).toHaveAttribute('hover', 'true');
    await expect(slashItems.nth(1).locator('.text')).toHaveText(['Heading 1']);
    await assertRichTexts(page, ['/']);

    await page.keyboard.press(`${SHORT_KEY}+p`);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.first()).toHaveAttribute('hover', 'true');
    await expect(slashItems.first().locator('.text')).toHaveText(['Text']);
    await assertRichTexts(page, ['/']);

    await page.keyboard.press(`${SHORT_KEY}+p`);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.last()).toHaveAttribute('hover', 'true');
    await expect(slashItems.last().locator('.text')).toHaveText(['Delete']);
    await assertRichTexts(page, ['/']);

    await page.keyboard.press(`${SHORT_KEY}+n`);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.first()).toHaveAttribute('hover', 'true');
    await expect(slashItems.first().locator('.text')).toHaveText(['Text']);
    await assertRichTexts(page, ['/']);
  });

  test('should open sub menu when hover on SubMenuItem', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, '/');
    const slashMenu = page.locator('.slash-menu[data-testid=sub-menu-0]');
    await expect(slashMenu).toBeVisible();

    const slashItems = slashMenu.locator('icon-button');

    const subMenu = page.locator('.slash-menu[data-testid=sub-menu-1]');

    let rect = await slashItems.nth(4).boundingBox();
    if (!rect) {
      throw new Error('rect is not found');
    }
    await page.mouse.move(rect.x + 10, rect.y + 10);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.nth(4)).toHaveAttribute('hover', 'true');
    await expect(slashItems.nth(4).locator('.text')).toHaveText([
      'Other Headings',
    ]);
    await expect(subMenu).toBeVisible();

    rect = await slashItems.nth(3).boundingBox();
    if (!rect) {
      throw new Error('rect is not found');
    }
    await page.mouse.move(rect.x + 10, rect.y + 10);
    await expect(slashMenu).toBeVisible();
    await expect(slashItems.nth(3)).toHaveAttribute('hover', 'true');
    await expect(slashItems.nth(3).locator('.text')).toHaveText(['Heading 3']);
    await expect(subMenu).toBeHidden();
  });

  test('navigate menu with left right arrow and Enter', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);

    const slashMenu = page.locator('.slash-menu[data-testid=sub-menu-0]');

    await type(page, '/');
    await expect(slashMenu).toBeVisible();
    await pressEscape(page);
    await expect(slashMenu).toBeHidden();

    await type(page, '/');
    await expect(slashMenu).toBeVisible();
    await pressArrowLeft(page);
    await expect(
      slashMenu,
      'root menu should be visible when press arrow left'
    ).toBeVisible();
    await pressEscape(page);

    // Test sub menu case
    const slashItems = slashMenu.locator('icon-button');

    await type(page, '/');
    await slashMenu.waitFor({ state: 'visible' });
    await pressArrowDown(page, 4);
    await expect(slashItems.nth(4)).toHaveAttribute('hover', 'true');
    await expect(slashItems.nth(4).locator('.text')).toHaveText([
      'Other Headings',
    ]);

    const subMenu = page.locator('.slash-menu[data-testid=sub-menu-1]');

    await pressArrowRight(page);
    await expect(slashMenu).toBeVisible();
    await expect(subMenu).toBeVisible();

    await pressArrowLeft(page);
    await expect(slashMenu).toBeVisible();
    await expect(subMenu).toBeHidden();

    await pressEnter(page);
    await expect(slashMenu).toBeVisible();
    await expect(subMenu).toBeVisible();
  });

  test('menu should be hidden when press escape', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);

    const slashMenu = page.locator('.slash-menu[data-testid=sub-menu-0]');

    await type(page, '/');
    await expect(slashMenu).toBeVisible();
    await pressEscape(page);
    await expect(slashMenu).toBeHidden();

    // go to sub menu
    await type(page, '/');
    await expect(slashMenu).toBeVisible();
    await pressArrowDown(page, 4);
    await pressArrowRight(page);
    await expect(slashMenu).toBeVisible();
    const subMenu = page.locator('.slash-menu[data-testid=sub-menu-1]');
    await expect(subMenu).toBeVisible();
    await pressEscape(page);
    await expect(slashMenu).toBeHidden();
    await expect(subMenu).toBeHidden();
  });

  test('show close current all submenu when typing', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);

    const slashMenu = page.locator('.slash-menu[data-testid=sub-menu-0]');
    const subMenu = page.locator('.slash-menu[data-testid=sub-menu-1]');
    const slashItems = slashMenu.locator('icon-button');

    await type(page, '/');
    await expect(slashMenu).toBeVisible();
    await pressArrowDown(page, 4);
    await expect(slashItems.nth(4)).toHaveAttribute('hover', 'true');
    await expect(slashItems.nth(4).locator('.text')).toHaveText([
      'Other Headings',
    ]);
    await pressEnter(page);
    await expect(subMenu).toBeVisible();

    await type(page, 'h');
    await expect(subMenu).toBeHidden();
  });

  test('should allow only pressing modifier key', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);

    const slashMenu = page.locator(`.slash-menu`);

    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    await page.keyboard.press(SHORT_KEY);
    await expect(slashMenu).toBeVisible();

    await page.keyboard.press('Shift');
    await expect(slashMenu).toBeVisible();
  });

  test('should allow other hotkey to passthrough', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, 'hello');
    await pressEnter(page);
    await type(page, 'world');

    const slashMenu = page.locator(`.slash-menu`);

    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    await page.keyboard.press(`${SHORT_KEY}+a`);
    await expect(slashMenu).toBeHidden();
    await assertRichTexts(page, ['hello', 'world/']);

    const selected = await getInlineSelectionText(page);
    expect(selected).toBe('world/');
  });

  test('can input search input after click menu', async ({ page }) => {
    await initEmptyParagraphState(page);
    const slashMenu = page.locator(`.slash-menu`);
    await focusRichText(page);
    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    const box = await slashMenu.boundingBox();
    if (!box) {
      throw new Error("slashMenu doesn't exist");
    }
    const { x, y } = box;
    await page.mouse.click(x + 10, y + 10);
    await expect(slashMenu).toBeVisible();
    await type(page, 'a');
    await assertRichTexts(page, ['/a']);
  });
});

test.describe('slash menu should not be shown in ignored blocks', () => {
  test('code block', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, '```');
    await pressEnter(page);
    await type(page, '/');
    await expect(page.locator('.slash-menu')).toBeHidden();
  });
});

test('should slash menu works with fast type', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'a/text', 0);
  const slashMenu = page.locator(`.slash-menu`);
  await expect(slashMenu).toBeVisible();
});

test('should clean slash string after soft enter', async ({
  page,
}, testInfo) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/1126',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await pressShiftEnter(page);
  await waitNextFrame(page);
  await type(page, '/copy');
  await pressEnter(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test.describe('slash search', () => {
  test('should slash menu search and keyboard works', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    const slashMenu = page.locator(`.slash-menu`);
    const slashItems = slashMenu.locator('icon-button');

    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    // search should active the first item
    await type(page, 'co');
    await expect(slashItems).toHaveCount(5);
    await expect(slashItems.nth(0).locator('.text')).toHaveText(['Copy']);
    await expect(slashItems.nth(1).locator('.text')).toHaveText(['Code Block']);
    await expect(slashItems.nth(2).locator('.text')).toHaveText(['Callout']);
    await expect(slashItems.nth(0)).toHaveAttribute('hover', 'true');

    await type(page, 'p');
    await expect(slashItems).toHaveCount(1);
    await expect(slashItems.nth(0).locator('.text')).toHaveText(['Copy']);

    // assert backspace works
    await pressBackspace(page);
    await expect(slashItems).toHaveCount(5);
    await expect(slashItems.nth(0).locator('.text')).toHaveText(['Copy']);
    await expect(slashItems.nth(1).locator('.text')).toHaveText(['Code Block']);
    await expect(slashItems.nth(2).locator('.text')).toHaveText(['Callout']);
    await expect(slashItems.nth(0)).toHaveAttribute('hover', 'true');
  });

  test('slash menu supports fuzzy search', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    const slashMenu = page.locator(`.slash-menu`);
    const slashItems = slashMenu.locator('icon-button');

    await type(page, '/');
    await expect(slashMenu).toBeVisible();

    await type(page, 'c');
    await expect(slashItems).toHaveCount(11);
    await expect(slashItems.nth(0).locator('.text')).toHaveText(['Copy']);
    await expect(slashItems.nth(1).locator('.text')).toHaveText(['Italic']);
    await expect(slashItems.nth(2).locator('.text')).toHaveText(['Callout']);
    await expect(slashItems.nth(3).locator('.text')).toHaveText(['New Doc']);
    await expect(slashItems.nth(4).locator('.text')).toHaveText(['Duplicate']);
    await expect(slashItems.nth(5).locator('.text')).toHaveText(['Code Block']);
    await expect(slashItems.nth(6).locator('.text')).toHaveText(['Linked Doc']);
    await expect(slashItems.nth(7).locator('.text')).toHaveText(['Attachment']);
    await type(page, 'b');
    await expect(slashItems.nth(0).locator('.text')).toHaveText(['Code Block']);
  });

  test('slash menu supports alias search', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, '/');
    const slashMenu = page.locator(`.slash-menu`);
    await expect(slashMenu).toBeVisible();

    const slashItems = slashMenu.locator('icon-button');
    await type(page, 'database');
    await expect(slashItems).toHaveCount(2);
    await expect(slashItems.nth(0).locator('.text')).toHaveText(['Table View']);
    await expect(slashItems.nth(1).locator('.text')).toHaveText([
      'Kanban View',
    ]);
    await type(page, 'v');
    await expect(slashItems).toHaveCount(0);
  });
});

test('should focus on code blocks created by the slash menu', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '000');

  await type(page, '/code');
  const slashMenu = page.locator(`.slash-menu`);
  await expect(slashMenu).toBeVisible();

  const codeBlock = page.getByTestId('Code Block');
  await codeBlock.click();
  await expect(slashMenu).toBeHidden();

  await focusRichText(page); // FIXME: flaky selection asserter
  await type(page, '111');
  await assertRichTexts(page, ['000111']);
});

// Selection is not yet available in edgeless
test('slash menu should work in edgeless mode', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);

  await addNote(page, '/', 30, 40);
  await assertRichTexts(page, ['', '/']);

  const slashMenu = page.locator(`.slash-menu`);
  await expect(slashMenu).toBeVisible();
});

test.describe('slash menu with date & time', () => {
  test("should insert Today's time string", async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, '/');
    const slashMenu = page.locator(`.slash-menu`);
    await expect(slashMenu).toBeVisible();

    const todayBlock = page.getByTestId('Today');
    await todayBlock.click();
    await expect(slashMenu).toBeHidden();

    const date = new Date();
    const formattedDate = formatWithTimezone(date);
    await assertRichTexts(page, [formattedDate]);
  });

  test("should create Tomorrow's time string", async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, '/');
    const slashMenu = page.locator(`.slash-menu`);
    await expect(slashMenu).toBeVisible();

    const todayBlock = page.getByTestId('Tomorrow');
    await todayBlock.click();
    await expect(slashMenu).toBeHidden();

    const date = new Date();
    date.setDate(date.getDate() + 1);
    const formattedDate = formatWithTimezone(date);

    await assertRichTexts(page, [formattedDate]);
  });

  test("should insert Yesterday's time string", async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, '/');
    const slashMenu = page.locator(`.slash-menu`);
    await expect(slashMenu).toBeVisible();

    const todayBlock = page.getByTestId('Yesterday');
    await todayBlock.click();
    await expect(slashMenu).toBeHidden();

    const date = new Date();
    date.setDate(date.getDate() - 1);
    const formattedDate = formatWithTimezone(date);

    await assertRichTexts(page, [formattedDate]);
  });
});

test.describe('slash menu with style', () => {
  test('should style text line works', async ({ page }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, 'hello/');
    const slashMenu = page.locator(`.slash-menu`);
    await expect(slashMenu).toBeVisible();
    const bold = page.getByTestId('Bold');
    await bold.click();

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}.json`
    );
  });

  test('should style empty line works', async ({ page }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, '/');
    const slashMenu = page.locator(`.slash-menu`);
    await expect(slashMenu).toBeVisible();
    const bold = page.getByTestId('Bold');
    await bold.click();
    await page.waitForTimeout(50);
    await type(page, 'hello');

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}.json`
    );
  });
});

test('should insert database', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await assertBlockCount(page, 'paragraph', 1);
  await type(page, '/');
  const tableBlock = page.getByTestId('Table View');
  await tableBlock.click();
  await assertBlockCount(page, 'paragraph', 0);
  await assertBlockCount(page, 'database', 1);

  const database = page.locator('affine-database');
  await expect(database).toBeVisible();
  const titleColumn = page.locator('.affine-database-column').nth(0);
  expect(await titleColumn.innerText()).toBe('Title');
  const defaultRows = page.locator('.affine-database-block-row');
  expect(await defaultRows.count()).toBe(3);
});

test('move block up and down by slash menu', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  const slashMenu = page.locator(`.slash-menu`);

  await focusRichText(page);
  await type(page, 'hello');
  await pressEnter(page);
  await type(page, 'world');
  await assertRichTexts(page, ['hello', 'world']);
  await type(page, '/');
  await expect(slashMenu).toBeVisible();

  const moveUp = page.getByTestId('Move Up');
  await moveUp.click();
  await assertRichTexts(page, ['world', 'hello']);
  await type(page, '/');
  await expect(slashMenu).toBeVisible();

  const moveDown = page.getByTestId('Move Down');
  await moveDown.click();
  await assertRichTexts(page, ['hello', 'world']);
});

test('delete block by slash menu should remove children', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await insertThreeLevelLists(page);
  const slashMenu = page.locator(`.slash-menu`);
  const slashItems = slashMenu.locator('icon-button');

  await captureHistory(page);
  await focusRichText(page, 1);
  await waitNextFrame(page);
  await type(page, '/');

  await expect(slashMenu).toBeVisible();
  await type(page, 'remove');
  await expect(slashItems).toHaveCount(1);
  await pressEnter(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );

  await undoByKeyboard(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await redoByKeyboard(page);
  await assertRichTexts(page, ['123']);
});

test('should slash menu can trigger linked doc popover', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '/linked');
  await pressEnter(page);
  await expect(page.locator('.linked-doc-popover')).toBeVisible();
  await assertRichTexts(page, ['@']);

  await type(page, 'doc');
  await pressEnter(page);
  await expect(page.locator('affine-reference')).toBeVisible();
  await expect(
    page.locator('affine-reference .affine-reference-title')
  ).toHaveText('doc');
});
