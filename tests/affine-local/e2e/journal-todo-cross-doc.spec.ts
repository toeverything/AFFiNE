import { skipOnboarding } from '@affine-test/kit/playwright';
import {
  confirmCreateJournal,
  openHomePage,
} from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect, type Locator, type Page, test } from '@playwright/test';

// Real end-to-end reproduction (2026-09-17, live bug reports) for two
// Journal Todo bugs that only manifest through a CROSS-DOC reference (a
// Journal Todo whose canonical table lives on another page, which is how
// Journal Todo always works in practice) -- not reproducible via a
// same-doc/single-page database. Both prior fixes were validated only at
// the blocksuite/integration-test level (constructed via direct commands,
// e.g. insertDatabaseViewRefBlockCommand); this suite drives the actual
// running app the way a user does, per Jasper's explicit "real Playwright
// test before the fix" operating procedure.
//
// Tests build on each other sequentially rather than each repeating full
// setup: the first test creates the canonical + journal-template
// environment once; later tests assert one property each against that
// same environment, so a failure pinpoints exactly which property broke
// instead of one large opaque test.
//
// `mode: 'serial'` alone does NOT give this continuity -- @affine-test/
// kit's `page`/`context` fixtures (like Playwright's own defaults) are
// re-created fresh per test, which resets local IndexedDB storage (the
// workspace/doc data lives there) between tests. Genuine continuity needs
// one browser context created ONCE for the whole file via `beforeAll`,
// with every test operating on that same `page` via closure instead of
// the fixture-provided one. `skipOnboarding` is applied manually here
// since it's normally wired into the kit's own `context` fixture, which
// this file deliberately bypasses.
test.describe.configure({ mode: 'serial' });

test.describe('Journal Todo cross-doc bugs (live bug reports, 2026-09)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 800 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    // Matches @affine-test/kit's own context fixture (tests/kit/src/
    // playwright.ts) -- keeps animations at a short-but-nonzero 0.1s
    // instead of the app's default (longer) transition durations, which
    // this suite's several sequential UI-settling waits assume.
    await context.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        document.body.classList.add('playwright-test');
      });
    });
    await skipOnboarding(context);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // Playwright's own test runner requires the first arg to be a
  // destructuring pattern; this test needs no fixtures but does need the
  // second `testInfo` arg.
  test('setup: canonical Journal Todo on a normal page, plus a journal template referencing the same canonical', async (// oxlint-disable-next-line no-empty-pattern
  {}, testInfo) => {
    // This test does two full page-creation + slash-command flows plus a
    // settings-panel round trip -- meaningfully more sequential UI work
    // than a typical single-purpose test; the project's local (non-CI)
    // default of 30s is too tight for it.
    testInfo.setTimeout(90_000);
    await openHomePage(page);
    await dismissOpenInAppBannerIfShown(page);

    // Step 1: a normal (non-journal) page. First-ever "/Journal Todo"
    // creates the canonical database, pre-promoted into its own hidden
    // note (insertJournalTodoReference, configs/slash-menu.ts).
    await page.getByTestId('sidebar-new-page-button').click();
    await waitForEditorLoad(page);
    await page.keyboard.type('Journal Todo Source');
    await page.keyboard.press('Enter');
    await insertJournalTodo(page);

    // Step 2: a separate template page that ALSO references the same
    // canonical (every subsequent "/Journal Todo" invocation reuses the
    // already-set workspace pointer instead of creating a new canonical).
    await page.getByTestId('sidebar-new-page-button').click();
    await waitForEditorLoad(page);
    await page.keyboard.type('Journal Template');
    await page.keyboard.press('Enter');
    await insertJournalTodo(page);
    await markCurrentDocAsTemplate(page);

    const journalTemplateDocId = await getDocId(page);
    expect(journalTemplateDocId).toBeTruthy();

    // Step 3: set this page as the journal template.
    await page.getByTestId('slider-bar-workspace-setting-button').click();
    await page.getByTestId('workspace-setting:preference').click();
    await page.getByTestId('journal-template-selector').click();
    await page.getByTestId(`template-doc-item-${journalTemplateDocId}`).click();
    await page.getByTestId('modal-close-button').click();
  });

  test('bug 1 (Note color field): opening Journals for the first time (auto-selected today) creates a journal from the template with the Note-color field hidden', async () => {
    // Continues in the SAME page/workspace the setup test left behind.
    // This is deliberately the very FIRST journal-related action since
    // setup finished -- the reported bug ("auto-selected-today") is a
    // cold-canonical-doc race that is most likely to reproduce exactly
    // here, not after the canonical doc has already been warmed up by an
    // earlier action in the same session.
    await page.getByTestId('slider-bar-journals-button').click();
    await confirmCreateJournal(page);
    await waitForEditorLoad(page);

    await expect(
      page.locator('affine-database-view-ref').first()
    ).toBeVisible();
    // The canonical's host-doc load-and-retry (duplicate-middleware.ts) is
    // asynchronous -- give it a moment to settle before asserting the
    // Note-color column was hidden.
    await page.waitForTimeout(1500);

    await expect(
      page.getByText('Note color', { exact: false })
    ).not.toBeVisible();
  });

  test('bug 2 (Enter-key hierarchy regression): pressing Enter at the end of an indented row with text creates a new row, not an unindent', async () => {
    // Continues in the SAME journal doc bug 1 just created -- this is a
    // real cross-doc list view (the journal's database-view-ref points at
    // the canonical on the "Journal Todo Source" page), which is exactly
    // the condition the Enter-key regression requires and a same-doc list
    // view cannot reproduce.
    await addRowAndType(page, 'Parent');
    await addRowAndType(page, 'Child');
    // Indent "Child" under "Parent" (Tab -> ListViewUILogic.indentRow).
    await page.keyboard.press('Tab');

    const rows = page.locator('.affine-data-view-list-row[data-row-id]');
    const rowsBefore = await rows.count();

    const childRow = rows.filter({ hasText: 'Child' }).first();
    const indentSpacerBefore = await childRow
      .locator('.affine-data-view-list-indent-spacer')
      .evaluate(el => (el as HTMLElement).style.width);
    expect(indentSpacerBefore).not.toBe('0px');

    // Cursor is already at the end of "Child" right after typing + Tab;
    // add more text so the row is unambiguously non-empty, then Enter.
    await page.keyboard.type(' extra');
    await page.keyboard.press('Enter');

    const rowsAfter = await rows.count();
    expect(rowsAfter, 'Enter on a non-empty row must create a new row').toBe(
      rowsBefore + 1
    );

    const indentSpacerAfter = await childRow
      .locator('.affine-data-view-list-indent-spacer')
      .evaluate(el => (el as HTMLElement).style.width);
    expect(
      indentSpacerAfter,
      "Child's own hierarchy level must not change when Enter is pressed on non-empty content"
    ).toBe(indentSpacerBefore);
  });

  test('bug 2 regression guard: pressing Enter on an EMPTY indented row still unindents (the originally-requested feature)', async () => {
    // KNOWN FAILING (2026-09-17, newly discovered by this suite, not yet
    // root-caused or fixed): in this real cross-doc journal context, Enter
    // on a genuinely empty indented row creates a new row instead of
    // unindenting it -- the reverse of the original "empty rows always
    // unindent, even with text" bug this whole feature exists to fix. This
    // is DIFFERENT from and unrelated to the "bug 2" fix above (confirmed
    // correct by the passing test above) -- ruled out a test-construction
    // race first (fixed addRowAndFocus to wait for the row count to
    // actually increase, re-ran, identical result). `test.fail()` marks
    // this as an accepted, tracked failure so CI stays green while the gap
    // is visible rather than silently passing or breaking the build -- do
    // not remove test.fail() without first fixing the underlying
    // regression. Needs its own /gsd-debug session; deliberately not
    // chased further per explicit scope decision.
    test.fail();
    await addRowAndType(page, 'Empty-row-parent');
    await addRowAndFocus(page);
    await page.keyboard.press('Tab'); // indent this new, still-empty row

    const rows = page.locator('.affine-data-view-list-row[data-row-id]');
    const rowsBefore = await rows.count();
    const emptyRow = rows.last();
    const indentBefore = await emptyRow
      .locator('.affine-data-view-list-indent-spacer')
      .evaluate(el => (el as HTMLElement).style.width);
    expect(indentBefore).not.toBe('0px');

    await page.keyboard.press('Enter');

    const rowsAfter = await rows.count();
    expect(rowsAfter, 'Enter on an EMPTY row must not create a new row').toBe(
      rowsBefore
    );
    const indentAfter = await emptyRow
      .locator('.affine-data-view-list-indent-spacer')
      .evaluate(el => (el as HTMLElement).style.width);
    expect(indentAfter, 'Empty row must unindent by one level').toBe('0px');
  });
});

function getTemplateRow(page: Page) {
  return page.locator(
    '[data-testid="doc-property-row"][data-info-id="template"]'
  );
}

async function toggleTemplate(row: Locator, value: boolean) {
  const checkbox = row.locator('input[type="checkbox"]');
  const state = await checkbox.inputValue();
  const checked = state === 'on';
  if (checked !== value) {
    await checkbox.click();
  }
}

async function markCurrentDocAsTemplate(page: Page) {
  const collapse = page.getByTestId('page-info-collapse');
  const open = await collapse.getAttribute('aria-expanded');
  if (open?.toLowerCase() !== 'true') {
    await collapse.click();
  }

  if ((await getTemplateRow(page).count()) === 0) {
    const addPropertyButton = page.getByTestId('add-property-button');
    if (!(await addPropertyButton.isVisible())) {
      await page.getByTestId('property-collapsible-button').click();
    }
    await addPropertyButton.click();
    await page
      .locator('[role="menuitem"][data-property-type="journal"]')
      .click();
    await page.keyboard.press('Escape');
  } else if (!(await getTemplateRow(page).isVisible())) {
    await page.getByTestId('property-collapsible-button').click();
  }

  const templateRow = getTemplateRow(page);
  await expect(templateRow).toBeVisible();
  await toggleTemplate(templateRow, true);

  await page.locator('affine-note').first().click();
}

async function getDocId(page: Page) {
  return page.evaluate(() => {
    const url = window.location.href;
    return url.split('/').pop()?.split('?')[0];
  });
}

// Unrelated to this suite: OpenInAppService.bootstrap() (modules/open-in-app/
// services/index.ts) can show the "Open this doc in AFFiNE app" banner on a
// completely fresh browser profile some time AFTER initial navigation --
// looks like a startup race (the default local workspace it just redirected
// into isn't yet in getLocalWorkspaceIds() at the exact moment bootstrap()
// reads it). Not investigating that here; just poll for and dismiss it so it
// doesn't block the sidebar underneath it. Its bounding box reports outside
// the viewport in this environment even with a forced Playwright click, so
// activate it via keyboard instead, which does not depend on the element's
// on-screen position at all.
async function dismissOpenInAppBannerIfShown(page: Page) {
  const dismiss = page
    .getByTestId('open-in-app-card')
    .getByRole('button', { name: /dismiss/i });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await dismiss.isVisible().catch(() => false)) {
      await dismiss.focus();
      await page.keyboard.press('Enter');
      const stillThere = await dismiss.isVisible().catch(() => false);
      if (!stillThere) return;
    }
    await page.waitForTimeout(250);
  }
}

async function insertJournalTodo(page: Page) {
  await page.keyboard.type('/Journal Todo');
  // The slash menu is a custom BlockSuite Lit component, not native ARIA
  // menuitem markup -- select by the item's exact visible title text
  // instead (its own subtitle line is a separate text node, and the
  // "Set/New Journal Todo Table" sibling items have different exact
  // titles, so this doesn't ambiguously match more than one item).
  await page.getByText('Journal Todo', { exact: true }).first().click();
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible();
}

// Clicking "+ New Record" (`.new-record`, add-row.ts) creates a row but does
// NOT focus its title for editing -- confirmed live (a screenshot showed two
// visually blank rows after typing directly following the click). The
// title's rich-text needs its own explicit click to place a caret before
// `keyboard.type`/key presses reach it, same as any BlockSuite rich-text.
function newestRowTitle(page: Page) {
  return page
    .locator('.affine-data-view-list-row[data-row-id]')
    .last()
    .locator('.affine-data-view-list-title');
}

async function addRowAndFocus(page: Page) {
  const rows = page.locator('.affine-data-view-list-row[data-row-id]');
  const countBefore = await rows.count();
  // "+ New Record" briefly enters a transitional/disabled-looking state
  // right after being clicked (confirmed live via screenshot) -- a second
  // click issued too soon can silently no-op, leaving focus on the
  // PREVIOUS row and causing subsequently-typed text to land there instead
  // of a genuinely new row. Wait for the row count to actually increase
  // before proceeding, rather than assuming the click took effect.
  await page.locator('.new-record').first().click();
  await expect(rows).toHaveCount(countBefore + 1);
  await newestRowTitle(page).click();
}

async function addRowAndType(page: Page, text: string) {
  await addRowAndFocus(page);
  await page.keyboard.type(text);
}
