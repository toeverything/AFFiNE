import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page, test } from '@playwright/test';

// Real end-to-end reproduction (2026-09-20, live bug report) for
// "selecting ALL text in a List view row and pressing Delete/Backspace does
// nothing, while selecting all-but-the-first-character and deleting works".
//
// Per Jasper's "real Playwright test BEFORE the fix" operating procedure
// (see .planning/debug/row-delete-select-all.md), this drives the actual
// running app -- not blocksuite/integration-test's lower-level
// command-constructed harness -- and is written to fail against the current
// (unfixed) code before any fix is attempted.
//
// The suite is a DIFFERENTIAL: every case types the same text into the same
// kind of row and deletes via the same key. The ONLY thing that varies is
// where the selection starts. If the all-but-first-char case passes while
// the full-selection case fails, the selection's start boundary is isolated
// as the cause, with no other variable left to explain the difference.

const TEXT = 'hello';

test.describe('List view row: delete a fully-selected title', () => {
  // Each case gets its own page and its own single-row List view. Sharing one
  // list across cases let a previous case's leftover row win `.last()` and
  // silently swallowed the typing of the next case -- an independent page
  // per case also guarantees the selection boundary really is the only
  // variable between the control and the bug cases.
  test.beforeEach(async ({ page }) => {
    await openHomePage(page);
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    // Focus starts in the (empty) title field after clickNewPageButton;
    // Enter moves the caret into the first paragraph of the body, which is
    // where the "/" slash-command trigger is recognized.
    await page.keyboard.press('Enter');
    await insertListView(page);
  });

  // CONTROL. Selecting all-but-the-first character is the case the user
  // reports as WORKING. If this ever fails, the harness itself is wrong and
  // no conclusion may be drawn from the bug cases below.
  test('control: Shift+ArrowLeft over all-but-first char, then Backspace, deletes the selection', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await selectBackwards(page, TEXT.length - 1);
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText(TEXT.slice(0, 1));
  });

  // BUG CASE, keyboard selection. Identical to the control in every respect
  // except one extra Shift+ArrowLeft, which moves the selection's start from
  // index 1 to index 0.
  test('bug repro: Shift+ArrowLeft over ALL chars, then Backspace, deletes the selection', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await selectBackwards(page, TEXT.length);
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText('');
  });

  // BUG CASE, the way a user actually selects everything.
  //
  // NOTE the lowercase 'a'. Playwright's `press('ControlOrMeta+A')` delivers
  // `KeyboardEvent.key === 'A'` with `shiftKey === false`, which is NOT what
  // a real Cmd+A/Ctrl+A produces in a browser (`key === 'a'`). Using the
  // uppercase form here would test a key combination no user ever sends and
  // would let a fix look broken (or work) for the wrong reason. Verified
  // against the live app before relying on it.
  test('bug repro: Ctrl/Cmd+A then Backspace deletes the whole title', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText('');
  });

  // BUG CASE, Delete instead of Backspace -- the report names both keys, and
  // they take different branches of `onRowKeyDown`, so both need proving.
  // Against the unfixed code this one does not merely "do nothing": it
  // forward-deletes exactly one character (leaving "ello"), which is the
  // signature of a caret collapsed at index 0 rather than a live selection.
  test('bug repro: Ctrl/Cmd+A then Delete deletes the whole title', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await expect(row).toHaveText('');
  });

  // BOUNDARY NEIGHBOUR. A real Cmd+A sends `key: 'a'`, but with Caps Lock on
  // the very same keystroke sends `key: 'A'` (still `shiftKey === false`).
  // A case-sensitive hotkey match would leave Caps Lock users broken, so the
  // uppercase form is pinned here as its own case rather than assumed.
  test('bug repro: Ctrl/Cmd+A with Caps Lock (key "A") then Backspace deletes the whole title', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText('');
  });

  // BUG CASE, mouse selection -- triple-click is how most users "select the
  // whole line", and it sets the DOM selection's boundaries differently from
  // a keyboard selection (browsers commonly anchor it on element nodes
  // rather than text nodes), so it is not covered by the cases above.
  test('bug repro: triple-click then Backspace deletes the whole title', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await row.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await expect(row).toHaveText('');
  });
});

async function insertListView(page: Page) {
  await page.keyboard.type('/List View');
  await page.getByText('List View', { exact: true }).first().click();
  await expect(page.locator('affine-database').first()).toBeVisible();
}

function newestRowTitle(page: Page) {
  return page
    .locator('.affine-data-view-list-row[data-row-id]')
    .last()
    .locator('.affine-data-view-list-title');
}

/**
 * Adds a row, focuses its title and types `text` into it, returning a
 * locator bound to THAT row's title (resolved before any later row is added,
 * so each test keeps asserting against its own row).
 */
async function addRowAndType(page: Page, text: string) {
  const rows = page.locator('.affine-data-view-list-row[data-row-id]');
  const countBefore = await rows.count();
  // "+ New Record" briefly enters a transitional/disabled-looking state right
  // after being clicked -- wait for the row count to actually increase rather
  // than assuming the click took effect (see journal-todo-cross-doc.spec.ts
  // and undo-list-view.spec.ts for the same finding).
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
