import { type Page } from '@playwright/test';

export async function clickCollaborationPanel(page: Page) {
  await page.click('[data-tab-key="collaboration"]');
}

export async function clickPublishPanel(page: Page) {
  await page.click('[data-tab-key="publish"]');
}

export async function openSettingModal(page: Page) {
  await page.getByTestId('settings-modal-trigger').click();
}

export async function openAppearancePanel(page: Page) {
  await page.getByTestId('appearance-panel-trigger').click();
}

export async function openEditorSetting(page: Page) {
  await page.getByTestId('settings-modal-trigger').click();
  await page.getByTestId('editor-panel-trigger').click();
}

export async function openShortcutsPanel(page: Page) {
  await page.getByTestId('shortcuts-panel-trigger').click();
}

export async function openAboutPanel(page: Page) {
  await page.getByTestId('about-panel-trigger').click();
}

export async function openEditorInfoPanel(page: Page) {
  await page.getByTestId('header-info-button').click();
}

export async function openExperimentalFeaturesPanel(page: Page) {
  await page.getByTestId('experimental-features-trigger').click();
}

export async function confirmExperimentalPrompt(page: Page) {
  await page.getByTestId('experimental-prompt-disclaimer').click();
  await page.getByTestId('experimental-confirm-button').click();
}

export async function openWorkspaceSettingPanel(page: Page) {
  await page
    .getByTestId('settings-sidebar')
    .getByTestId('workspace-setting:preference')
    .click();
}

export async function clickUserInfoCard(page: Page) {
  await page.getByTestId('user-info-card').click({
    delay: 50,
  });
}

export async function closeSettingModal(page: Page) {
  await page
    .getByTestId('setting-modal')
    .getByTestId('modal-close-button')
    .click();
}
