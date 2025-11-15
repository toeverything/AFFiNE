import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  enableCloudWorkspace,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { getPageByTitle } from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

let user: {
  id: string;
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async ({ page }) => {
  user = await createRandomUser();
  await loginUser(page, user);
});

test.afterEach(async () => {
  // if you want to keep the user in the database for debugging,
  // comment this line
  await deleteUser(user.email);
});

test('should show blob management dialog', async ({ page }) => {
  await enableCloudWorkspace(page);

  await clickSideBarAllPageButton(page);

  // delete the welcome page ('Getting Started')
  await getPageByTitle(page, 'Getting Started')
    .getByTestId('doc-list-operation-button')
    .click();
  const deleteBtn = page.getByTestId('doc-list-operation-trash');
  await deleteBtn.click();
  await expect(page.getByText('Delete doc?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();

  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await expect(page.getByTestId('setting-modal')).toBeVisible();
  await page.getByTestId('workspace-setting:storage').click();
  await expect(page.getByTestId('blob-preview-card')).toHaveCount(9);

  // get the unused blobs count
  const count = await page.getByText(/Unused blobs \(\d+\)/).textContent();
  const unusedBlobsCount = parseInt(count?.match(/\d+/)?.[0] ?? '0');

  // count should > 9
  expect(unusedBlobsCount).toBeGreaterThan(9);
  await page.getByTestId('blob-preview-card').nth(0).click();
  await expect(page.getByText('1 Selected')).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Delete blob files')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(
    page.getByText(`Unused blobs (${unusedBlobsCount - 1})`)
  ).toBeVisible();
});
