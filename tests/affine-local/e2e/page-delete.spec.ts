import { test } from '@affine-test/kit/playwright';
import {
  clickMoreActionsButton,
  clickMoveToTrashButtonAndConfirm,
} from '@affine-test/kit/utils/all-page-list';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  getBlockSuiteEditorTitle,
  newPage,
  waitEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import {
  clickSideBarAllPageButton,
  clickSideBarTrashButton,
} from '@affine-test/kit/utils/sidebar';
import { clickDeletePermanentlyButtonAndConfirm } from '@affine-test/kit/utils/trash-list';
import { expect } from '@playwright/test';

test.describe('page delete', () => {
  let homePageId: string;

  test.beforeEach(async ({ page }) => {
    homePageId = await openHomePage(page);
    await waitEditorLoad(page);
  });

  test('should delete existing page at all page list successfully', async ({
    page,
  }) => {
    await clickSideBarAllPageButton(page);
    await expect(
      page.getByTestId(`page-list-item-${homePageId}`)
    ).toBeInViewport();

    await clickMoreActionsButton(page, homePageId);
    await clickMoveToTrashButtonAndConfirm(page);

    await clickSideBarTrashButton(page);
    await clickDeletePermanentlyButtonAndConfirm(page, homePageId);
    await expect(page.getByText("There's no page here yet")).toBeInViewport();

    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(10);
    await expect(page.getByText("There's no page here yet")).toBeInViewport();
    await expect(
      page.getByTestId(`page-list-item-${homePageId}`)
    ).not.toBeInViewport();
  });

  test('should delete new created page at all page list successfully', async ({
    page,
  }) => {
    const newPageId = await newPage(page);
    await getBlockSuiteEditorTitle(page).click();
    await getBlockSuiteEditorTitle(page).fill('this is a new page to delete');

    await clickSideBarAllPageButton(page);
    await expect(
      page.getByTestId(`page-list-item-${newPageId}`)
    ).toBeInViewport();
    await expect(
      page.getByTestId(`page-list-item-${homePageId}`)
    ).toBeInViewport();

    await clickMoreActionsButton(page, newPageId);
    await clickMoveToTrashButtonAndConfirm(page);

    await clickSideBarTrashButton(page);
    await clickDeletePermanentlyButtonAndConfirm(page, newPageId);
    await expect(page.getByText("There's no page here yet")).toBeInViewport();

    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(10);
    await expect(
      page.getByTestId(`page-list-item-${newPageId}`)
    ).not.toBeInViewport();
    await expect(
      page.getByTestId(`page-list-item-${homePageId}`)
    ).toBeInViewport();
  });

  test.skip('should delete current page successfully', async ({ page }) => {
    await clickSideBarAllPageButton(page);
    const homePageListItem = page.getByTestId(`page-list-item-${homePageId}`);
    await expect(homePageListItem).toBeInViewport();

    await homePageListItem.click();
    await page.getByTestId('editor-option-menu').click();
    await page.getByTestId('editor-option-menu-delete').click();
    await page.getByRole('button', { name: 'Delete' }).click();

    await page.reload();
    await page.waitForTimeout(1000);

    await expect(
      page.getByRole('button', { name: 'Restore it' })
    ).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Delete permanently' })
    ).toBeInViewport();

    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(1000);

    // await clickSideBarTrashButton(page);
    // await clickDeletePermanentlyButtonAndConfirm(page, homePageId);
    // await expect(page.getByText('There's no page here yet')).toBeInViewport();
    //
    //
    // await clickSideBarAllPageButton(page);
    // await page.waitForTimeout(10);
    // await expect(page.getByText('There's no page here yet')).toBeInViewport();
    // await expect(page.getByTestId(`page-list-item-${homePageId}`)).not.toBeInViewport();
  });
});
