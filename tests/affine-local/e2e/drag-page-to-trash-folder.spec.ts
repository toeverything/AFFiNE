import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { dragTo, waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('drag a page from "All pages" list onto the "Trash" folder in the sidebar to move it to trash list', async ({
  page,
}) => {
  // TODO-Doma
  // Init test db with known workspaces and open "All Pages" page via url directly
  {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await page.getByTestId('app-sidebar').getByText('All Pages').click();
    await page.waitForTimeout(500);
  }

  const title = 'AFFiNE - not just a note-taking app';

  await dragTo(
    page,
    page.locator(`[role="button"]:has-text("${title}")`),
    page.getByTestId('app-sidebar').getByText('Trash')
  );

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
