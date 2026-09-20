import { test } from '@affine-test/kit/mobile';
import { expect } from '@playwright/test';

import { expandCollapsibleSection, pageBack } from './utils';

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
  context,
}) => {
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
