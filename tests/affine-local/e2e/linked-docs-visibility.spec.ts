/**
 * E2E tests for GitHub issue #15253:
 * "Enable Hide Linked Page On Bottom Of Page"
 *
 * Covers:
 *  - Toggling "Display linked docs" in editor settings hides/shows the
 *    outgoing-links section at the bottom of a page doc.
 *  - Toggling "Display bi-directional links" hides/shows the entire panel.
 *  - The two settings are independent: hiding the panel hides both sections;
 *    hiding only linked docs still shows backlinks.
 *  - Settings persist across page navigation.
 */
import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  createLinkedPage,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { openEditorSetting } from '@affine-test/kit/utils/setting';
import { expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Open the editor setting modal and navigate to the Page section. */
async function openPageEditorSettings(page: Page) {
  await openEditorSetting(page);
  // The Page section is always the active section inside editor settings,
  // but make sure we're on the right panel by checking for a known trigger.
  await expect(
    page.getByTestId('display-bi-link-trigger')
  ).toBeVisible();
}

/** Expand the bi-directional links panel on the current doc page. */
async function expandBiDirectionalPanel(
  page: Page
) {
  const showBtn = page.getByRole('button', { name: 'Show' });
  if (await showBtn.isVisible()) {
    await showBtn.click();
  }
}

// ---------------------------------------------------------------------------
// Setup: each test gets a fresh doc with a linked page so the outgoing-links
// section has at least one entry to assert against.
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
  // Create a linked page so the "Outgoing links" section is populated
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'Linked Target Doc');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('bi-directional link panel is visible by default', async ({ page }) => {
  const panel = page.getByTestId('bi-directional-link-panel');
  await expect(panel).toBeVisible();
});

test('toggling "Display bi-directional links" OFF hides the entire panel', async ({
  page,
}) => {
  const panel = page.getByTestId('bi-directional-link-panel');
  await expect(panel).toBeVisible();

  await openPageEditorSettings(page);
  const biLinkSwitch = page.getByTestId('display-bi-link-trigger');
  await biLinkSwitch.click(); // turn OFF
  await page.keyboard.press('Escape'); // close modal

  await expect(panel).not.toBeVisible();
});

test('toggling "Display bi-directional links" back ON restores the panel', async ({
  page,
}) => {
  const panel = page.getByTestId('bi-directional-link-panel');

  // Turn off
  await openPageEditorSettings(page);
  await page.getByTestId('display-bi-link-trigger').click();
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();

  // Turn back on
  await openPageEditorSettings(page);
  await page.getByTestId('display-bi-link-trigger').click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
});

test('toggling "Display linked docs" OFF hides only the outgoing-links section', async ({
  page,
}) => {
  // First expand the panel so both sections are visible
  await expandBiDirectionalPanel(page);

  const linkedDocsSection = page.getByTestId(
    'bi-directional-link-panel-linked-docs'
  );
  await expect(linkedDocsSection).toBeVisible();

  await openPageEditorSettings(page);
  const linkedDocsSwitch = page.getByTestId('display-linked-docs-trigger');
  await linkedDocsSwitch.click(); // turn OFF
  await page.keyboard.press('Escape');

  // The panel itself remains visible
  await expect(page.getByTestId('bi-directional-link-panel')).toBeVisible();
  // But the linked-docs subsection is gone
  await expect(linkedDocsSection).not.toBeVisible();
});

test('toggling "Display linked docs" back ON restores the outgoing-links section', async ({
  page,
}) => {
  await expandBiDirectionalPanel(page);

  const linkedDocsSection = page.getByTestId(
    'bi-directional-link-panel-linked-docs'
  );

  // Turn off
  await openPageEditorSettings(page);
  await page.getByTestId('display-linked-docs-trigger').click();
  await page.keyboard.press('Escape');
  await expect(linkedDocsSection).not.toBeVisible();

  // Turn back on
  await openPageEditorSettings(page);
  await page.getByTestId('display-linked-docs-trigger').click();
  await page.keyboard.press('Escape');

  await expect(linkedDocsSection).toBeVisible();
});

test('backlinks section remains visible when "Display linked docs" is OFF', async ({
  page,
}) => {
  // Navigate to the linked target doc so there is a backlink pointing to it
  await page.locator('affine-reference:has-text("Linked Target Doc")').click();
  await waitForEmptyEditor(page);

  await expandBiDirectionalPanel(page);

  // Turn off linked docs only
  await openPageEditorSettings(page);
  await page.getByTestId('display-linked-docs-trigger').click();
  await page.keyboard.press('Escape');

  // The panel is still there
  await expect(page.getByTestId('bi-directional-link-panel')).toBeVisible();
  // The linked-docs section is gone
  await expect(
    page.getByTestId('bi-directional-link-panel-linked-docs')
  ).not.toBeVisible();
  // The backlinks section (docs that reference this page) is still visible
  await expect(
    page.getByTestId('bi-directional-link-panel-backlinks')
  ).toBeVisible();
  // The panel show/hide button confirms the panel is expanded
  await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
});

test('settings persist when navigating to another doc and back', async ({
  page,
}) => {
  // Turn off display-linked-docs
  await openPageEditorSettings(page);
  await page.getByTestId('display-linked-docs-trigger').click();
  await page.keyboard.press('Escape');

  // Navigate away: create a new page
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);

  // Navigate back (use browser back)
  await page.goBack();
  await page.waitForTimeout(300);

  // Expand panel
  await expandBiDirectionalPanel(page);

  // Setting should still be off
  await expect(
    page.getByTestId('bi-directional-link-panel-linked-docs')
  ).not.toBeVisible();
});

test('"Display linked docs" switch reflects current state in settings UI', async ({
  page,
}) => {
  await openPageEditorSettings(page);
  const switchInput = page
    .getByTestId('display-linked-docs-trigger')
    .locator('input');

  // Default is ON
  await expect(switchInput).toBeChecked();

  // Turn off
  await page.getByTestId('display-linked-docs-trigger').click();
  await expect(switchInput).not.toBeChecked();

  // Turn on again
  await page.getByTestId('display-linked-docs-trigger').click();
  await expect(switchInput).toBeChecked();

  await page.keyboard.press('Escape');
});

test('"Display bi-directional links" being OFF makes "Display linked docs" irrelevant', async ({
  page,
}) => {
  // Turn off the entire panel
  await openPageEditorSettings(page);
  await page.getByTestId('display-bi-link-trigger').click();
  await page.keyboard.press('Escape');

  // Panel is gone
  await expect(page.getByTestId('bi-directional-link-panel')).not.toBeVisible();

  // Even if linked-docs is "on" (it is by default), nothing is shown because
  // the parent panel is hidden - this is the correct product behaviour.
  await expect(
    page.getByTestId('bi-directional-link-panel-linked-docs')
  ).not.toBeVisible();
});
