import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page, test } from '@playwright/test';

// Real end-to-end reproduction (2026-09-22, live bug report) for:
// "in ANY List view row title, whenever a text selection includes the FIRST
// character (index 0), Delete / Backspace / typing a replacement letter all
// fail to modify the row -- regardless of how the selection was made. Any
// selection excluding index 0 works."
//
// See .planning/debug/row-index0-selection-delete.md.
//
// This report DIRECTLY CONTRADICTS the recorded results of the previous
// session (.planning/debug/row-delete-select-all.md), whose suite recorded
// `Shift+ArrowLeft xN` over ALL characters and triple-click-then-Backspace as
// PASSING against pre-fix code. Both cannot be true as stated, so this suite
// is built as a DIFFERENTIAL MATRIX rather than as a single repro: it holds
// the row, the text and the row type constant and varies only the axes the
// previous suite never crossed --
//
//   1. selection DIRECTION: backward (anchor at the end, focus at index 0 --
//      the ONLY form the previous suite tested) vs forward (anchor AT index 0);
//   2. selection METHOD: keyboard / double-click / click-drag / triple-click;
//   3. the ACTION: Backspace / Delete / typing a replacement character (the
//      last of these was never tested at all);
//   4. cell ENTRY: selecting in the same editing session in which the text was
//      typed (all previous cases) vs leaving the cell and clicking back in,
//      which is what a user actually does.
//
// Whichever cells fail name the real discriminating variable.

// This file must NOT run its cases in parallel. The repo config sets
// `fullyParallel: true`, and under it every case here -- controls included --
// failed inside `beforeEach` waiting for the editor, purely because N parallel
// browsers starve the single dev server. The same cases pass one at a time.
// `mode: 'default'` restores per-file sequencing without `mode: 'serial'`'s
// skip-the-rest-on-first-failure behaviour, which a differential matrix cannot
// afford: every cell has to be measured, including the ones after a failure.
test.describe.configure({ mode: 'default' });

const TEXT = 'alpha beta';

// Generous budget for the two setup steps that contend for the dev server.
// Running this file with the config's default 4 parallel workers starved the
// server badly enough that EVERY case -- including the controls -- failed
// inside `beforeEach` at `expect(affine-database).toBeVisible()`, while the
// same cases passed at `--workers=1`. A uniform red run that looks exactly
// like a total reproduction of the reported bug, caused entirely by the
// harness, is the worst possible failure mode for a differential matrix, so
// these two steps get a timeout that reflects how long a loaded dev server
// actually takes rather than how long an idle one does.
const SLOW = 60_000;

test.describe('List view row: selections that include index 0', () => {
  test.beforeEach(async ({ page }) => {
    await openHomePage(page);
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    await page.keyboard.press('Enter');
    await insertListView(page);
  });

  // ---------------------------------------------------------------- keyboard

  // CONTROL. Selection EXCLUDES index 0. The user reports this shape as
  // working; if it ever fails the harness is wrong and nothing below can be
  // concluded.
  test('control | keyboard backward, excludes index 0 | Backspace', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await selectBackwards(page, TEXT.length - 1);
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText(TEXT.slice(0, 1));
  });

  // The exact case the PREVIOUS session recorded as PASSING. Selection
  // includes index 0, but it is built BACKWARDS, so the DOM anchor sits at the
  // end of the text and only the focus lands on index 0.
  test('keyboard backward over ALL chars, includes index 0 | Backspace', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await selectBackwards(page, TEXT.length);
    await page.keyboard.press('Backspace');
    await expectRowEmpty(row);
  });

  // NEW AXIS: same selection content as the control, but built FORWARDS from
  // index 0, so the DOM anchor is AT index 0. Every method the user names
  // (double-click, drag from the start, triple-click, Cmd+A) produces this
  // shape, and the previous suite never produced it even once.
  test('keyboard forward from index 0 | Backspace', async ({ page }) => {
    const row = await addRowAndType(page, TEXT);
    await selectForwardFrom(page, 0, 5);
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText(' beta');
  });

  // Direction control for the case above: identical forward selection, moved
  // one character right so it starts at index 1 instead of index 0. Isolates
  // the index-0 boundary with direction held constant.
  test('control | keyboard forward from index 1 | Backspace', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await selectForwardFrom(page, 1, 4);
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText('a beta');
  });

  test('keyboard forward from index 0 | Delete', async ({ page }) => {
    const row = await addRowAndType(page, TEXT);
    await selectForwardFrom(page, 0, 5);
    await page.keyboard.press('Delete');
    await expect(row).toHaveText(' beta');
  });

  // --------------------------------------------------- typing a replacement
  // Never covered by any previous suite, for any selection shape.

  test('keyboard forward from index 0 | type a replacement char', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await selectForwardFrom(page, 0, 5);
    await page.keyboard.type('X');
    await expect(row).toHaveText('X beta');
  });

  test('control | keyboard forward from index 1 | type a replacement char', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await selectForwardFrom(page, 1, 4);
    await page.keyboard.type('X');
    await expect(row).toHaveText('aX beta');
  });

  // ------------------------------------------------------------------- mouse

  // Double-click on the FIRST word: a real selection that includes index 0,
  // made the way the user made it. Browsers differ on whether the trailing
  // space is included, so the oracle is "the row changed and 'beta' survived"
  // rather than one exact string.
  test('double-click FIRST word, includes index 0 | Backspace', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await dblclickWord(page, row, 'first');
    await page.keyboard.press('Backspace');
    await expect(row).not.toHaveText(TEXT);
    await expect(row).toHaveText(/beta/);
  });

  // CONTROL for the case above: double-click the LAST word, which excludes
  // index 0.
  test('control | double-click LAST word, excludes index 0 | Backspace', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await dblclickWord(page, row, 'last');
    await page.keyboard.press('Backspace');
    await expect(row).not.toHaveText(TEXT);
    await expect(row).toHaveText(/alpha/);
  });

  test('double-click FIRST word, includes index 0 | type a replacement char', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await dblclickWord(page, row, 'first');
    await page.keyboard.type('X');
    await expect(row).not.toHaveText(TEXT);
    await expect(row).toHaveText(/X/);
  });

  // Click-drag starting at the very left edge of the text -- the other method
  // the user names. Drag direction is left-to-right, so the anchor is at
  // index 0.
  test('click-drag from the start, includes index 0 | Backspace', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await dragSelect(page, row, 'from-start');
    await page.keyboard.press('Backspace');
    await expect(row).not.toHaveText(TEXT);
  });

  // CONTROL: same drag mechanics, but starting past the first character.
  test('control | click-drag from the middle, excludes index 0 | Backspace', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await dragSelect(page, row, 'from-middle');
    await page.keyboard.press('Backspace');
    await expect(row).not.toHaveText(TEXT);
  });

  test('triple-click, includes index 0 | Backspace', async ({ page }) => {
    const row = await addRowAndType(page, TEXT);
    await row.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await expectRowEmpty(row);
  });

  test('triple-click, includes index 0 | type a replacement char', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await row.click({ clickCount: 3 });
    await page.keyboard.type('X');
    await expect(row).toHaveText('X');
  });

  // ------------------------------------------------------- re-entered cell
  // Every previous case selected text inside the SAME editing session in which
  // it was typed. A user hits this bug on a row typed minutes ago: they click
  // into an existing row, then select. That re-entry runs a different code
  // path (afterEnterEditingMode -> focusEnd, a fresh rich-text render) and has
  // never been tested.

  test('re-entered cell | keyboard backward over ALL chars | Backspace', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await leaveAndReenterCell(page, row);
    await selectBackwards(page, TEXT.length);
    await page.keyboard.press('Backspace');
    await expectRowEmpty(row);
  });

  test('re-entered cell | double-click FIRST word | Backspace', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await leaveAndReenterCell(page, row);
    await dblclickWord(page, row, 'first');
    await page.keyboard.press('Backspace');
    await expect(row).not.toHaveText(TEXT);
    await expect(row).toHaveText(/beta/);
  });

  test('re-entered cell | triple-click | Backspace', async ({ page }) => {
    const row = await addRowAndType(page, TEXT);
    await leaveAndReenterCell(page, row);
    await row.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await expectRowEmpty(row);
  });
});

// ---------------------------------------------------------------------------
// MULTI-ROW, with a NON-EMPTY neighbour above the row under test.
//
// Two facts discovered by dumping the real DOM (e2e/row-index0-dom.spec.ts)
// make this block necessary, and make the obvious way of writing it wrong:
//
//  1. A freshly inserted List View is NOT empty -- it ships with THREE rows
//     already. So the earlier assumption that these suites were exercising a
//     single-row list was false: `.last()` has always been row index 3+, and
//     `onRowKeyDown`'s `if (rowIndex <= 0) return;` guard was never what kept
//     those tests green. What those rows all had in common is that the
//     NEIGHBOURS were EMPTY.
//  2. Row ORDER is not stable across typing. Converting a row to a todo list
//     (`ensureTodoListRow`, fired from `focusin` and from every keydown) can
//     move it, so a locator bound to `.last()` before typing can resolve to a
//     different row afterwards. Binding by position produced a row containing
//     "previous rowalpha beta" -- two tests' text in one row -- which looks
//     like a product bug and is purely a harness artifact.
//
// Everything below therefore binds rows by their CONTENT after the text has
// settled, never by position, and asserts both that the target row changed and
// that its non-empty neighbour was not silently merged into.
test.describe('List view row: index-0 selections with a NON-EMPTY row above', () => {
  test.beforeEach(async ({ page }) => {
    await openHomePage(page);
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    await page.keyboard.press('Enter');
    await insertListView(page);
  });

  const PREV = 'previous row';

  test('multi-row | keyboard backward over ALL chars, includes index 0 | Backspace', async ({
    page,
  }) => {
    const { prev, row } = await twoNeighbouringRows(page, PREV, TEXT);
    await selectBackwards(page, TEXT.length);
    await page.keyboard.press('Backspace');
    await expectRowEmpty(row);
    await expect(prev).toHaveText(PREV);
  });

  test('control | multi-row | keyboard backward, excludes index 0 | Backspace', async ({
    page,
  }) => {
    const { prev, row } = await twoNeighbouringRows(page, PREV, TEXT);
    await selectBackwards(page, TEXT.length - 1);
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText(TEXT.slice(0, 1));
    await expect(prev).toHaveText(PREV);
  });

  test('multi-row | keyboard forward from index 0 | Backspace', async ({
    page,
  }) => {
    const { prev, row } = await twoNeighbouringRows(page, PREV, TEXT);
    await selectForwardFrom(page, 0, 5);
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText(' beta');
    await expect(prev).toHaveText(PREV);
  });

  test('multi-row | keyboard backward over ALL chars | Delete', async ({
    page,
  }) => {
    const { prev, row } = await twoNeighbouringRows(page, PREV, TEXT);
    await selectBackwards(page, TEXT.length);
    await page.keyboard.press('Delete');
    await expectRowEmpty(row);
    await expect(prev).toHaveText(PREV);
  });

  test('multi-row | keyboard backward over ALL chars | type a replacement char', async ({
    page,
  }) => {
    const { prev, row } = await twoNeighbouringRows(page, PREV, TEXT);
    await selectBackwards(page, TEXT.length);
    await page.keyboard.type('X');
    await expect(row).toHaveText('X');
    await expect(prev).toHaveText(PREV);
  });

  test('multi-row | double-click FIRST word, includes index 0 | Backspace', async ({
    page,
  }) => {
    const { prev, row } = await twoNeighbouringRows(page, PREV, TEXT);
    await dblclickWord(page, row, 'first');
    await page.keyboard.press('Backspace');
    await expect(row).not.toHaveText(TEXT);
    await expect(row).toHaveText(/beta/);
    await expect(prev).toHaveText(PREV);
  });

  test('multi-row | triple-click, includes index 0 | Backspace', async ({
    page,
  }) => {
    const { prev, row } = await twoNeighbouringRows(page, PREV, TEXT);
    await row.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await expectRowEmpty(row);
    await expect(prev).toHaveText(PREV);
  });

  test('multi-row | click-drag from the start, includes index 0 | Backspace', async ({
    page,
  }) => {
    const { prev, row } = await twoNeighbouringRows(page, PREV, TEXT);
    await dragSelect(page, row, 'from-start');
    await page.keyboard.press('Backspace');
    await expect(row).not.toHaveText(TEXT);
    await expect(prev).toHaveText(PREV);
  });

  test('multi-row | re-entered cell | triple-click | Backspace', async ({
    page,
  }) => {
    const { prev, row } = await twoNeighbouringRows(page, PREV, TEXT);
    await leaveAndReenterCell(page, row);
    await row.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await expectRowEmpty(row);
    await expect(prev).toHaveText(PREV);
  });
});

/** Strips zero-width placeholder characters the editor renders in empty lines. */
function stripPlaceholders(s: string) {
  return s.replace(/\u200B|\u200C|\u200D|\uFEFF/g, '').trim();
}

/**
 * Types `prevText` into one empty row and `text` into the next one, then
 * re-resolves BOTH by content and returns locators bound to their row ids.
 * Leaves the caret at the end of `text`'s row, in edit mode.
 *
 * Content-bound, not position-bound, on purpose -- see the block comment above.
 */
async function twoNeighbouringRows(page: Page, prevText: string, text: string) {
  await typeIntoFirstEmptyRow(page, prevText);
  await typeIntoFirstEmptyRow(page, text);
  const prev = await rowTitleByText(page, prevText);
  const row = await rowTitleByText(page, text);
  // Re-enter the target row so the caret is at the end of its text, matching
  // the single-row cases' starting state.
  await row.click();
  await page.keyboard.press('End');
  return { prev, row };
}

async function typeIntoFirstEmptyRow(page: Page, text: string) {
  const rows = page.locator('.affine-data-view-list-row[data-row-id]');
  const count = await rows.count();
  let target = -1;
  for (let i = 0; i < count; i++) {
    if (stripPlaceholders(await rows.nth(i).innerText()) === '') {
      target = i;
      break;
    }
  }
  if (target < 0) {
    // No empty row left -- add one.
    await page.locator('.new-record').first().click();
    await expect(rows).toHaveCount(count + 1);
    target = count;
  }
  await rows.nth(target).locator('.affine-data-view-list-title').click();
  await page.keyboard.type(text);
  await rowTitleByText(page, text);
}

/** Resolves a row by its exact (placeholder-stripped) title text. */
async function rowTitleByText(page: Page, text: string) {
  const rows = page.locator('.affine-data-view-list-row[data-row-id]');
  let rowId: string | null = null;
  await expect
    .poll(
      async () => {
        const count = await rows.count();
        for (let i = 0; i < count; i++) {
          if (stripPlaceholders(await rows.nth(i).innerText()) === text) {
            rowId = await rows.nth(i).getAttribute('data-row-id');
            return true;
          }
        }
        return false;
      },
      { message: `no row whose title is exactly ${JSON.stringify(text)}` }
    )
    .toBe(true);
  return page
    .locator(`.affine-data-view-list-row[data-row-id="${rowId}"]`)
    .locator('.affine-data-view-list-title');
}

/**
 * Asserts the row title is empty, tolerating the editor's empty-line
 * PLACEHOLDER character.
 *
 * This is load-bearing, not cosmetic. When an inline editor's text is emptied,
 * WebKit leaves a zero-width non-joiner (U+200C) in the rendered line, so the
 * row's text reads "\u200C" rather than "". Playwright's `toHaveText('')`
 * normalises whitespace but NOT zero-width characters, so it reports the row
 * as unchanged -- which is indistinguishable, from the outside, from the very
 * bug this suite is hunting. Four WebKit "failures" here were exactly this and
 * nothing else: every test in the suite that asserted `toHaveText('')` failed
 * on WebKit, and no other test did. Measured, not guessed -- a live probe read
 * the row back as "\u200C" after the deletion had in fact succeeded.
 *
 * Asserting on content with the placeholder stripped tests what the user
 * actually cares about (is the row empty) instead of a rendering detail that
 * differs per engine.
 */
async function expectRowEmpty(row: ReturnType<typeof newestRowTitle>) {
  await expect
    .poll(
      async () =>
        (await row.innerText())
          .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
          .trim(),
      { message: 'row title should be empty (ignoring zero-width placeholder)' }
    )
    .toBe('');
}

async function insertListView(page: Page) {
  await page.keyboard.type('/List View');
  await page
    .getByText('List View', { exact: true })
    .first()
    .click({ timeout: SLOW });
  await expect(page.locator('affine-database').first()).toBeVisible({
    timeout: SLOW,
  });
}

function newestRowTitle(page: Page) {
  return page
    .locator('.affine-data-view-list-row[data-row-id]')
    .last()
    .locator('.affine-data-view-list-title');
}

/**
 * Adds a row, focuses its title and types `text` into it, returning a locator
 * bound to THAT row's title (resolved before any later row is added).
 */
async function addRowAndType(page: Page, text: string) {
  const rows = page.locator('.affine-data-view-list-row[data-row-id]');
  const countBefore = await rows.count();
  // "+ New Record" briefly enters a transitional state right after being
  // clicked -- wait for the row count to actually increase rather than
  // assuming the click took effect.
  await page.locator('.new-record').first().click();
  await expect(rows).toHaveCount(countBefore + 1);
  const title = newestRowTitle(page);
  await title.click();
  await page.keyboard.type(text);
  await expect(title).toHaveText(text);

  const rowId = await rows.last().getAttribute('data-row-id');
  return page
    .locator(`.affine-data-view-list-row[data-row-id="${rowId}"]`)
    .locator('.affine-data-view-list-title');
}

/** Extends the selection leftwards from the caret by `count` characters. */
async function selectBackwards(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Shift+ArrowLeft');
  }
}

/**
 * Builds a FORWARD selection: caret to the very start, right by `start`, then
 * Shift+ArrowRight `length` times. The resulting DOM anchor sits at `start`,
 * which is the shape every mouse-made selection has and the previous suite
 * never produced.
 */
async function selectForwardFrom(page: Page, start: number, length: number) {
  await page.keyboard.press('Home');
  for (let i = 0; i < start; i++) {
    await page.keyboard.press('ArrowRight');
  }
  for (let i = 0; i < length; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }
}

/**
 * Double-clicks inside the first or last word of the row title. Uses raw mouse
 * coordinates rather than `locator.dblclick()` (which always targets the
 * element's centre) so the word under the pointer is controlled.
 */
async function dblclickWord(
  page: Page,
  row: ReturnType<typeof newestRowTitle>,
  which: 'first' | 'last'
) {
  const box = await row.boundingBox();
  if (!box) throw new Error('row title has no bounding box');
  const y = box.y + box.height / 2;
  // The title cell is flex:1 and far wider than the text, so target a small
  // offset from the text's own left edge rather than a fraction of the cell.
  const textBox = await row.locator('rich-text').boundingBox();
  if (!textBox) throw new Error('rich-text has no bounding box');
  const x =
    which === 'first' ? textBox.x + 12 : textBox.x + textBox.width * 0.5;
  await page.mouse.dblclick(x, y);
}

async function dragSelect(
  page: Page,
  row: ReturnType<typeof newestRowTitle>,
  mode: 'from-start' | 'from-middle'
) {
  const textBox = await row.locator('rich-text').boundingBox();
  if (!textBox) throw new Error('rich-text has no bounding box');
  const y = textBox.y + textBox.height / 2;
  const startX = mode === 'from-start' ? textBox.x + 1 : textBox.x + 20;
  const endX = textBox.x + 45;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 8 });
  await page.mouse.up();
}

/**
 * Leaves the cell's editing session and clicks back into it, so the following
 * selection is made against a freshly (re-)entered cell rather than the one
 * the text was typed into.
 */
async function leaveAndReenterCell(
  page: Page,
  row: ReturnType<typeof newestRowTitle>
) {
  await page.keyboard.press('Escape');
  // Click well away from the database so the cell fully exits editing mode.
  await page
    .locator('affine-page-root')
    .first()
    .click({ position: { x: 5, y: 5 } });
  await row.click();
  await expect(row.locator('rich-text')).toBeVisible();
}
