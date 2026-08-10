import { test } from '@affine-test/kit/mobile';
import { expect, type Page } from '@playwright/test';

const openSettings = async (page: Page) => {
  await page.getByTestId('settings-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('header:has-text("Settings")')).toBeVisible();
};

const openWorkspaceSettings = async (page: Page) => {
  await openSettings(page);
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText('Delete workspace', { exact: true })
  ).toBeVisible();
  return dialog;
};

test('can open settings', async ({ page }) => {
  await openSettings(page);
  await expect(page.getByText('Devices', { exact: true })).toHaveCount(0);
});

test('can change theme', async ({ page }) => {
  await openSettings(page);
  const select = page
    .getByTestId('setting-row')
    .filter({
      hasText: 'Color mode',
    })
    .getByTestId('native-dropdown-select-trigger');

  await select.selectOption('light');
  await select.selectOption('dark');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('shows a workspace group', async ({ page }) => {
  await openWorkspaceSettings(page);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Workspace', { exact: true })).toBeVisible();
  await expect(
    page.getByTestId('setting-row').filter({ hasText: 'Image' })
  ).toBeVisible();
  await expect(
    page.getByTestId('setting-row').filter({ hasText: 'Workspace name' })
  ).toBeVisible();
});

test('can rename the current workspace', async ({ page }) => {
  await openWorkspaceSettings(page);

  const nameRow = page
    .getByTestId('setting-row')
    .filter({ hasText: 'Workspace name' });
  await nameRow.click();
  await page.getByTestId('rename-input').fill('Renamed workspace');
  await page.getByTestId('rename-confirm').click();

  await expect(nameRow).toContainText('Renamed workspace');
  await expect(page.getByText('Update workspace name success')).toBeVisible();
});

test('deleting a workspace asks for its name', async ({ page }) => {
  const dialog = await openWorkspaceSettings(page);

  const name = (
    (await page
      .getByTestId('setting-row')
      .filter({ hasText: 'Workspace name' })
      .textContent()) ?? ''
  )
    .replace('Workspace name', '')
    .trim();
  expect(name).toBeTruthy();

  await dialog.getByText('Delete workspace', { exact: true }).click();
  const confirm = page.getByTestId('delete-workspace-confirm-button');
  const input = page.getByTestId('delete-workspace-input');
  await expect(confirm).toBeDisabled();

  await input.fill('not the name');
  await expect(confirm).toBeDisabled();

  await input.fill(name);
  await expect(confirm).toBeEnabled();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
});
