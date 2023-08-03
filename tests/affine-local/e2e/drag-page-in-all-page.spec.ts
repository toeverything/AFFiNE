import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.describe('drag to trash folder', () => {
  test('drag a page from "All pages" list onto the "Trash" folder in the sidebar to move it to trash list', async ({
    page,
  }) => {
    // TODO-Doma
    // Init test db with known workspaces and open "All Pages" page via url directly
    {
      await openHomePage(page);
      await waitEditorLoad(page);
      await page.getByText('All Pages').click();
      await page.waitForTimeout(500);
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
});

test.describe('drag to favorite folder', () => {
  test('should drag a page from all page list to favorite folder successfully', async ({
    page,
  }) => {
    await openHomePage(page);
    await waitEditorLoad(page);
    const pageId = page.url().split('/').reverse()[0];
    await page.getByText('All Pages').click();
    await page.waitForTimeout(500);

    const title = 'AFFiNE - not just a note taking app';

    await page.getByText(title).hover();
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.getByText('Favourites').hover();
    await page.mouse.up();

    await expect(
      page.getByTestId('affine-toast'),
      'A toast containing success message is shown'
    ).toBeVisible();

    // await expect(
    //   page.getByText('Added to Favorites'),
    //   'A toast containing success message is shown'
    // ).toBeVisible();

    const addedFavoritesLink = page.getByRole('link', {
      name: title,
    });
    await expect(
      addedFavoritesLink,
      'The added page should show in favorites folder'
    ).toBeVisible();
    await expect(
      page.getByTestId(`more-actions-${pageId}`).getByRole('button').first(),
      'The added page should show in favorites folder'
    ).toHaveJSProperty('active', undefined);
  });
});
