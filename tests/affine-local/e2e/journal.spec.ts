import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect, type Locator, type Page } from '@playwright/test';

type MaybeDate = string | number | Date;
function isSameDay(d1: MaybeDate, d2: MaybeDate) {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function getJournalRow(page: Page) {
  return page.locator(
    '[data-testid="doc-property-row"][data-info-id="journal"]'
  );
}
async function isJournalEditor(page: Page, maybeDate?: string | number | Date) {
  // journal header
  const header = page.getByTestId('header');
  const weekPicker = header.getByTestId('journal-week-picker');
  await expect(weekPicker).toBeVisible();

  // journal title
  const journalTitle = page.getByTestId('journal-title');
  await expect(journalTitle).toBeVisible();

  if (maybeDate) {
    const date = (await journalTitle.getByTestId('date').textContent()) ?? '';
    expect(isSameDay(date, maybeDate)).toBeTruthy();
  }
}
async function openPagePropertiesAndAddJournal(page: Page) {
  const collapse = page.getByTestId('page-info-collapse');
  const open = await collapse.getAttribute('aria-expanded');
  if (open?.toLowerCase() !== 'true') {
    await collapse.click();
  }

  // add if not exists
  if ((await getJournalRow(page).count()) === 0) {
    const addPropertyButton = page.getByTestId('add-property-button');
    if (!(await addPropertyButton.isVisible())) {
      await page.getByTestId('property-collapsible-button').click();
    }
    await addPropertyButton.click();
    await page
      .locator('[role="menuitem"][data-property-type="journal"]')
      .click();
    await page.keyboard.press('Escape');
  }
  // expand if collapsed
  else if (!(await getJournalRow(page).isVisible())) {
    await page.getByTestId('property-collapsible-button').click();
  }

  const journalRow = getJournalRow(page);
  await expect(journalRow).toBeVisible();
  return journalRow;
}
async function toggleJournal(row: Locator, value: boolean) {
  const checkbox = row.locator('input[type="checkbox"]');
  const state = await checkbox.inputValue();
  const checked = state === 'on';
  if (checked !== value) {
    await checkbox.click();
    const newState = await checkbox.inputValue();
    const newChecked = newState === 'on';
    expect(newChecked).toBe(value);
  }
}
async function createPageAndTurnIntoJournal(page: Page) {
  await page.getByTestId('sidebar-new-page-button').click();
  await waitForEditorLoad(page);
  const journalRow = await openPagePropertiesAndAddJournal(page);
  await toggleJournal(journalRow, true);
  return journalRow;
}

test('Create a journal from sidebar', async ({ page }) => {
  await openHomePage(page);
  await page.getByTestId('slider-bar-journals-button').click();
  await waitForEditorLoad(page);
  await isJournalEditor(page);
});

test('Create a page and turn it into a journal', async ({ page }) => {
  await openHomePage(page);
  await createPageAndTurnIntoJournal(page);
  await isJournalEditor(page, new Date());
});

test('Should show duplicated tag when create journal on same day', async ({
  page,
}) => {
  await openHomePage(page);
  await createPageAndTurnIntoJournal(page);
  const journalRow2 = await createPageAndTurnIntoJournal(page);
  await expect(journalRow2.getByTestId('conflict-tag')).toBeVisible();
});

test('Resolve duplicated journal', async ({ page }) => {
  await openHomePage(page);
  await createPageAndTurnIntoJournal(page);
  const journalRow2 = await createPageAndTurnIntoJournal(page);
  await journalRow2.getByTestId('conflict-tag').click();
  const journalPanel = page.getByTestId('sidebar-journal-panel');
  await expect(journalPanel).toBeVisible();
  const conflictList = journalPanel.getByTestId('journal-conflict-list');
  await expect(conflictList).toBeVisible();
  const conflictItems = conflictList.getByTestId('journal-conflict-item');
  const first = conflictItems.first();
  await first.getByTestId('journal-conflict-edit').click();
  await page.getByTestId('journal-conflict-remove-mark').click();

  await expect(journalRow2.getByTestId('conflict-tag')).not.toBeVisible();
  await expect(conflictList).not.toBeVisible();
});
