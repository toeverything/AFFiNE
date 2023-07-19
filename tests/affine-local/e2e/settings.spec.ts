import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import {
  openAboutPanel,
  openAppearancePanel,
  openPluginsPanel,
  openSettingModal,
  openShortcutsPanel,
} from '@affine-test/kit/utils/setting';
import { createWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

test('Open settings modal', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await openSettingModal(page);

  const modal = await page.getByTestId('setting-modal');
  await expect(modal).toBeVisible();
});

test('Change theme', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await openSettingModal(page);
  await openAppearancePanel(page);
  const root = page.locator('html');

  await page.getByTestId('light-theme-trigger').click();
  const lightMode = await root.evaluate(element =>
    element.getAttribute('data-theme')
  );
  expect(lightMode).toBe('light');

  await page.getByTestId('dark-theme-trigger').click();
  const darkMode = await root.evaluate(element =>
    element.getAttribute('data-theme')
  );
  expect(darkMode).toBe('dark');
});

test('Change layout width', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await openSettingModal(page);
  await openAppearancePanel(page);

  await page.getByTestId('full-width-layout-trigger').click();

  const editorWrapper = await page.locator('.editor-wrapper');
  const className = await editorWrapper.getAttribute('class');
  expect(className).toContain('full-screen');
});

test('Open shortcuts panel', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await openSettingModal(page);
  await openShortcutsPanel(page);
  const title = await page.getByTestId('keyboard-shortcuts-title');
  await expect(title).toBeVisible();
});

test('Open plugins panel', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await openSettingModal(page);
  await openPluginsPanel(page);
  const title = await page.getByTestId('plugins-title');
  await expect(title).toBeVisible();
});

test('Open about panel', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await openSettingModal(page);
  await openAboutPanel(page);
  const title = await page.getByTestId('about-title');
  await expect(title).toBeVisible();
});

test('Different workspace should have different name in the setting panel', async ({
  page,
}) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await createWorkspace({ name: 'New Workspace 2' }, page);
  await createWorkspace({ name: 'New Workspace 3' }, page);
  await openSettingModal(page);
  await page.getByTestId('current-workspace-label').click();
  expect(await page.getByTestId('workspace-name-input').inputValue()).toBe(
    'New Workspace 3'
  );
  await page.getByText('New Workspace 2').click();
  expect(await page.getByTestId('workspace-name-input').inputValue()).toBe(
    'New Workspace 2'
  );
});
