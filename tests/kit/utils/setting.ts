import type { Page } from '@playwright/test';

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

export async function openShortcutsPanel(page: Page) {
  await page.getByTestId('shortcuts-panel-trigger').click();
}

export async function openAboutPanel(page: Page) {
  await page.getByTestId('about-panel-trigger').click();
}

export async function openWorkspaceSettingPanel(
  page: Page,
  workspaceName: string
) {
  await page.getByTestId('settings-sidebar').getByText(workspaceName).click();
}
