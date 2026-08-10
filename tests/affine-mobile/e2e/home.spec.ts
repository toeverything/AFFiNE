import { test } from '@affine-test/kit/mobile';
import { expect } from '@playwright/test';

import { expandCollapsibleSection, openTab, pageBack } from './utils';

declare global {
  interface Window {
    currentWorkspace?: {
      meta: { id: string; flavour: string };
    };
  }
}

test('after loaded, will land on the home page', async ({ page }) => {
  await expect(page).toHaveURL(/.*\/home/);
});

test('stale first-open state still restores one local workspace', async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem('app_config', '{"onBoarding":false}');
    window.localStorage.setItem('is-first-open', 'false');
  });
  const page = await context.newPage();

  await page.goto('http://localhost:8080/');
  await page.waitForFunction(() => window.currentWorkspace !== undefined);
  const firstWorkspace = await page.evaluate(async () => {
    if (!window.currentWorkspace) {
      await new Promise<void>(resolve => {
        window.addEventListener('affine:workspace:change', () => resolve(), {
          once: true,
        });
      });
    }
    return window.currentWorkspace?.meta;
  });

  expect(firstWorkspace?.flavour).toBe('local');
  await page.goto(
    `http://localhost:8080/workspace/${firstWorkspace?.id ?? ''}/home`
  );
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page
    .locator('[data-testid="workspace-selector-trigger"]:visible')
    .click();
  await expect(
    page.getByRole('dialog').getByTestId('workspace-avatar')
  ).toHaveCount(1);

  await page.reload();
  await page.waitForFunction(() => window.currentWorkspace !== undefined);
  const reloadedWorkspace = await page.evaluate(
    () => window.currentWorkspace?.meta
  );
  expect(reloadedWorkspace?.id).toBe(firstWorkspace?.id);

  await context.close();
});

test('workspace selector does not offer workspace creation', async ({
  page,
}) => {
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page
    .locator('[data-testid="workspace-selector-trigger"]:visible')
    .click();
  await expect(page.getByText('Workspace', { exact: true })).toBeVisible();
  await expect(page.getByTestId('new-workspace')).toHaveCount(0);
  await expect(page.getByText('Name your workspace')).toHaveCount(0);
});

test('app tabs is visible', async ({ page }) => {
  const tabs = page.locator('#app-tabs');
  await expect(tabs).toHaveCount(1);
  await expect(tabs).toBeVisible();

  await expect(tabs.getByRole('tab', { name: 'home' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'all' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'journal' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'new' })).toBeVisible();
});

test('notifications prompt unauthenticated users to sign in', async ({
  page,
}) => {
  await page.getByTestId('notification-button').tap();
  const notifications = page.getByText('Sign in to continue');
  await expect(notifications).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('continue-login-button')).toBeVisible();
});

test('recent docs', async ({ page }) => {
  const recentSection = await expandCollapsibleSection(page, 'recent');

  const docs = recentSection.getByTestId('doc-card');
  const firstDoc = docs.first();

  await expect(firstDoc).toBeVisible();

  const title = await firstDoc
    .getByTestId('doc-card-header')
    .getByRole('heading')
    .textContent();

  // when click favorite icon, will show in the favorites section
  await docs.getByRole('button', { name: 'favorite' }).first().click();

  const favList = await expandCollapsibleSection(page, 'favorites');
  await expect(favList).toBeVisible();

  if (title) {
    await expect(favList).toContainText(title);
  }
});

test('all tab', async ({ page }) => {
  const docsTab = page.locator('#app-tabs').getByRole('tab', { name: 'all' });
  await expect(docsTab).toBeVisible();

  await docsTab.click();

  const todayDocs = page.getByTestId('doc-list-item');
  await expect(todayDocs.first()).toBeVisible();
  expect(await todayDocs.count()).toBeGreaterThan(0);
});

test('trash tab', async ({ page }) => {
  await openTab(page, 'all');
  await page.getByRole('link', { name: 'Trash', exact: true }).click();

  await expect(page).toHaveURL(/\/trash$/);
  await expect(page.getByText('Deleted docs will appear here.')).toBeVisible();
});

test('a trashed doc can be found and restored from trash', async ({ page }) => {
  await openTab(page, 'all');
  const doc = page.getByTestId('doc-list-item').first();
  await expect(doc).toBeVisible();
  const title = await doc.getByTestId('doc-list-item-title').textContent();
  expect(title).toBeTruthy();

  await doc.click();
  await expect(page.locator('.affine-page-viewport')).toBeVisible();
  await page.getByTestId('detail-page-header-more-button').click();
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await openTab(page, 'all');
  await page.getByRole('link', { name: 'Trash', exact: true }).click();
  const trashed = page.getByTestId('doc-list-item').first();
  await expect(trashed).toBeVisible();
  await expect(trashed).toContainText(title ?? '');

  await trashed.getByTestId('restore-page-button').click();
  await expect(page.getByText('Deleted docs will appear here.')).toBeVisible();
});

test('search restores query and results without reopening the keyboard', async ({
  page,
}) => {
  await expandCollapsibleSection(page, 'recent');
  const title = await page
    .getByTestId('doc-card')
    .first()
    .getByTestId('doc-card-header')
    .getByRole('heading')
    .textContent();
  expect(title).toBeTruthy();
  await page.getByRole('searchbox').click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.locator('#app-tabs')).toBeHidden();
  const search = page.getByRole('searchbox');
  await search.fill(title ?? '');
  const result = page.locator('[data-scroll] [data-testid="doc-card"]').first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).not.toHaveURL(/\/search$/);
  await pageBack(page);
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole('searchbox')).toHaveValue(title ?? '');
  await expect(
    page.locator('[data-scroll] [data-testid="doc-card"]').first()
  ).toBeVisible();
  expect(
    await page
      .getByRole('searchbox')
      .evaluate(el => el === document.activeElement)
  ).toBe(false);
});
