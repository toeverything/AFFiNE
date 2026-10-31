import { skipOnboarding } from '@affine-test/kit/playwright';
import {
  confirmCreateJournal,
  openHomePage,
} from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page, test } from '@playwright/test';

// Real end-to-end reproduction (2026-09-17, live bug report) for
// "Ctrl/Cmd+Z does not undo edits to a database List view row on desktop."
// Per Jasper's "real Playwright test before the fix" operating procedure
// (see .planning/debug/undo-not-working-list-view.md), this drives the
// actual running app -- not blocksuite/integration-test's lower-level
// command-constructed harness.
//
// This first test isolates the PLAIN SAME-PAGE case (a List-view database
// inserted directly on the page being edited, via the "/List View" slash
// command) -- no cross-doc reference involved -- to determine whether the
// bug is universal to List view or specific to the cross-doc
// (database-view-ref / Journal Todo) case.

test('same-page List view: Ctrl/Cmd+Z undoes a row edit', async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
  // Focus starts in the (empty) title field after clickNewPageButton;
  // Enter moves the caret into the first paragraph of the body, which is
  // where the "/" slash-command trigger is recognized.
  await page.keyboard.press('Enter');

  await insertListView(page);
  await addRowAndType(page, 'undo-me');
  await expect(page.getByText('undo-me', { exact: true })).toBeVisible();

  // Let the CRDT undo-capture debounce settle so the just-typed text
  // becomes its own discrete undo-stack entry rather than remaining
  // merge-eligible with whatever comes next.
  await page.waitForTimeout(600);

  await undoUntil(
    page,
    async () => (await page.getByText('undo-me', { exact: true }).count()) === 0
  );

  await expect(page.getByText('undo-me', { exact: true })).not.toBeVisible();
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

async function addRowAndFocus(page: Page) {
  const rows = page.locator('.affine-data-view-list-row[data-row-id]');
  const countBefore = await rows.count();
  // "+ New Record" briefly enters a transitional/disabled-looking state
  // right after being clicked -- wait for the row count to actually
  // increase before proceeding, rather than assuming the click took
  // effect (see journal-todo-cross-doc.spec.ts for the same finding).
  await page.locator('.new-record').first().click();
  await expect(rows).toHaveCount(countBefore + 1);
  await newestRowTitle(page).click();
}

async function addRowAndType(page: Page, text: string) {
  await addRowAndFocus(page);
  await page.keyboard.type(text);
}

// Cross-doc case: a List view rendered via `database-view-ref` (the
// mechanism Journal Todo always uses in practice) where the row blocks
// live in a DIFFERENT doc's store than the outer page rendering them.
// Follows journal-todo-cross-doc.spec.ts's setup pattern exactly (own
// browser context shared across serial tests via closure, since the
// default per-test `page`/`context` fixtures reset local IndexedDB
// between tests).
test.describe('cross-doc List view (Journal Todo) undo', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 800 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
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

  test('setup: canonical Journal Todo on a normal page, plus a journal template referencing it', async (// oxlint-disable-next-line no-empty-pattern
  {}, testInfo) => {
    testInfo.setTimeout(90_000);
    await openHomePage(page);
    await dismissOpenInAppBannerIfShown(page);

    await page.getByTestId('sidebar-new-page-button').click();
    await waitForEditorLoad(page);
    await page.keyboard.type('Journal Todo Source (undo repro)');
    await page.keyboard.press('Enter');
    await insertJournalTodo(page);

    await page.getByTestId('sidebar-new-page-button').click();
    await waitForEditorLoad(page);
    await page.keyboard.type('Journal Template (undo repro)');
    await page.keyboard.press('Enter');
    await insertJournalTodo(page);
    await markCurrentDocAsTemplate(page);

    const journalTemplateDocId = await getDocId(page);
    expect(journalTemplateDocId).toBeTruthy();

    await page.getByTestId('slider-bar-workspace-setting-button').click();
    await page.getByTestId('workspace-setting:preference').click();
    await page.getByTestId('journal-template-selector').click();
    await page.getByTestId(`template-doc-item-${journalTemplateDocId}`).click();
    await page.getByTestId('modal-close-button').click();
  });

  test('bug repro: Ctrl/Cmd+Z does not undo a row edit in a cross-doc List view', async () => {
    await page.getByTestId('slider-bar-journals-button').click();
    await confirmCreateJournal(page);
    await waitForEditorLoad(page);

    await expect(
      page.locator('affine-database-view-ref').first()
    ).toBeVisible();
    // Give the canonical's cross-doc host-load a moment to settle (same
    // reasoning as journal-todo-cross-doc.spec.ts's bug-1 test).
    await page.waitForTimeout(1500);

    await addRowAndType(page, 'cross-doc-undo-me');
    await expect(
      page.getByText('cross-doc-undo-me', { exact: true })
    ).toBeVisible();

    await page.waitForTimeout(600);

    await undoUntil(
      page,
      async () =>
        (await page.getByText('cross-doc-undo-me', { exact: true }).count()) ===
        0
    );

    await expect(
      page.getByText('cross-doc-undo-me', { exact: true })
    ).not.toBeVisible();
  });
});

function getTemplateRow(page: Page) {
  return page.locator(
    '[data-testid="doc-property-row"][data-info-id="template"]'
  );
}

async function toggleTemplate(
  row: ReturnType<typeof getTemplateRow>,
  value: boolean
) {
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
  await page.getByText('Journal Todo', { exact: true }).first().click();
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible();
}

// Repeatedly presses Ctrl/Cmd+Z, checking `predicate` after each press, up
// to `maxTries` times. This is deliberately tolerant of how many discrete
// undo-stack entries the row-creation + typing produced (which is an
// implementation detail of the CRDT undo-capture debounce, not something
// this test should assume) -- what it proves is that undo has SOME visible
// effect within a small, bounded number of presses. If the bug is present
// (undo is a global no-op for this content), the predicate never becomes
// true regardless of how many times it's pressed, which is exactly the
// failure this test needs to catch.
async function undoUntil(
  page: Page,
  predicate: () => Promise<boolean>,
  maxTries = 15
) {
  for (let i = 0; i < maxTries; i++) {
    if (await predicate()) return;
    await page.keyboard.press('ControlOrMeta+Z');
    await page.waitForTimeout(200);
  }
  // Final check so the caller's own assertion produces the failure message.
  await predicate();
}
