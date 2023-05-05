import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';

test('drag a page from "All pages" list onto the "Favorites" folder in the sidebar to mark it as favorite', async ({
  page,
}) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  //   TODO-Doma
  // Init test db with known workspaces and open "All Pages" page via url directly
  await page.getByText('All Pages').click();

  await page.getByText('Welcome to AFFiNE').hover();
  await page.mouse.down();
  await page.waitForTimeout(10);
  await page.getByText('Favorites').hover();
  await page.mouse.up();

  await expect(
    page.getByText('Added to Favorites'),
    'A toast containing success message is shown'
  ).toBeVisible();
  await expect(
    page.getByTestId('favorited-icon'),
    'Bookmark icon is shown on the page list item'
  ).toBeVisible();
  await expect(
    page.getByTestId('app-sidebar').getByText('Welcome to AFFiNE'),
    'New favorite page is shown in the sidebar'
  ).toBeVisible();
});
