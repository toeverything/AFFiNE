import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitEditorLoad } from '../libs/page-logic';

test('drag a page from "All pages" list onto the "Trash" folder in the sidebar to move it to trash list', async ({
  page,
}) => {
  // TODO-Doma
  // Init test db with known workspaces and open "All Pages" page via url directly
  {
    await openHomePage(page);
    await waitEditorLoad(page);
    await page.getByText('All Pages').click();
  }

  const title = 'AFFiNE - not just a note taking app';

  // Drag-and-drop
  // Ref: https://playwright.dev/docs/input#dragging-manually
  await page.getByText(title).hover();
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.getByText('Trash').hover();
  await page.mouse.up();

  await expect(
    page.getByText('Successfully deleted'),
    'A toast containing success message is shown'
  ).toBeVisible();

  await expect(
    page.getByText(title),
    'The deleted post is no longer on the All Page list'
  ).toHaveCount(0);

  // TODO-Doma
  // Visit trash page via url
  await page.getByText('Trash', { exact: true }).click();
  await expect(
    page.getByText(title),
    'The deleted post exists in the Trash list'
  ).toHaveCount(1);
});
