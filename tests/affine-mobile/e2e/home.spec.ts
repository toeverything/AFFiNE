import { test } from '@affine-test/kit/mobile';
import { expect } from '@playwright/test';

import { expandCollapsibleSection } from './utils';

test('after loaded, will land on the home page', async ({ page }) => {
  await expect(page).toHaveURL(/.*\/home/);
});

test('app tabs is visible', async ({ page }) => {
  const tabs = page.locator('#app-tabs');
  await expect(tabs).toBeVisible();

  await expect(tabs.getByRole('tab', { name: 'home' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'all' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'journal' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'new' })).toBeVisible();
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
  expect(await todayDocs.count()).toBeGreaterThan(0);
});
