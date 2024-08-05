import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickPageModeButton,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  createLinkedPage,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import {
  confirmExperimentalPrompt,
  openExperimentalFeaturesPanel,
  openSettingModal,
} from '@affine-test/kit/utils/setting';
import { expect, type Page } from '@playwright/test';

async function enableOutlineViewer(page: Page) {
  await openSettingModal(page);
  await openExperimentalFeaturesPanel(page);
  const prompt = page.getByTestId('experimental-prompt');
  await expect(prompt).toBeVisible();
  await confirmExperimentalPrompt(page);
  const settings = page.getByTestId('experimental-settings');
  const enableOutlineViewerSetting = settings.getByTestId(
    'outline-viewer-switch'
  );
  await expect(enableOutlineViewerSetting).toBeVisible();
  await enableOutlineViewerSetting.click();
  await page.waitForTimeout(500);
  await page.getByTestId('modal-close-button').click();
  await page.waitForTimeout(500);
}

test('outline viewer is useable', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
  await enableOutlineViewer(page);

  const title = getBlockSuiteEditorTitle(page);
  await title.click();
  await title.pressSequentially('Title');
  await expect(title).toContainText('Title');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# ');
  await page.keyboard.type('Heading 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## ');
  await page.keyboard.type('Heading 2');
  await page.keyboard.press('Enter');

  const indicators = page.locator('.outline-heading-indicator');
  await expect(indicators).toHaveCount(2);
  await expect(indicators.nth(0)).toBeVisible();
  await expect(indicators.nth(1)).toBeVisible();

  const viewer = page.locator('affine-outline-panel-body');
  await indicators.first().hover({ force: true });
  await expect(viewer).toBeVisible();
});

test('outline viewer should hide in edgeless mode', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
  await enableOutlineViewer(page);

  const title = getBlockSuiteEditorTitle(page);
  await title.click();
  await title.pressSequentially('Title');
  await page.keyboard.press('Enter');
  await expect(title).toHaveText('Title');
  await page.keyboard.type('# ');
  await page.keyboard.type('Heading 1');

  const indicators = page.locator('.outline-heading-indicator');
  await expect(indicators).toHaveCount(1);

  await clickEdgelessModeButton(page);
  await expect(indicators).toHaveCount(0);

  await clickPageModeButton(page);
  await expect(indicators).toHaveCount(1);
});

test('outline viewer should be useable in doc peek preview', async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await enableOutlineViewer(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);

  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'Test Page');

  await page.locator('affine-reference').hover();

  await expect(
    page.locator('.affine-reference-popover-container')
  ).toBeVisible();

  await page
    .locator('editor-menu-button editor-icon-button[aria-label="Open doc"]')
    .click();
  await page
    .locator('editor-menu-action:has-text("Open in center peek")')
    .click();

  const peekView = page.getByTestId('peek-view-modal');
  await expect(peekView).toBeVisible();

  const title = peekView.locator('doc-title .inline-editor');
  await title.click();
  await page.keyboard.press('Enter');

  await page.keyboard.type('# Heading 1');

  const indicators = peekView.locator('.outline-heading-indicator');
  await expect(indicators).toHaveCount(1);
  await expect(indicators).toBeVisible();

  await indicators.first().hover({ force: true });
  const viewer = peekView.locator('affine-outline-panel-body');
  await expect(viewer).toBeVisible();

  const toggleButton = peekView.locator(
    '.outline-viewer-header-container edgeless-tool-icon-button'
  );
  await toggleButton.click();

  await page.waitForTimeout(500);
  await expect(peekView).toBeHidden();
  await expect(viewer).toBeHidden();
  await expect(page.locator('affine-outline-panel')).toBeVisible();
});
