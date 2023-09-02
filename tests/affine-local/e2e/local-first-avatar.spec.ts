import { resolve } from 'node:path';

import { rootDir, test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { newPage, waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('should create a page with a local first avatar', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await newPage(page);
  await page.getByTestId('workspace-name').click();
  await page.getByTestId('new-workspace').click({ delay: 50 });
  await page
    .getByTestId('create-workspace-input')
    .type('Test Workspace 1', { delay: 50 });
  await page.getByTestId('create-workspace-create-button').click();
  await page.getByTestId('workspace-name').click();
  await page.getByTestId('workspace-card').nth(1).click();
  await page.getByTestId('settings-modal-trigger').click();
  await page.getByTestId('current-workspace-label').click();
  await page
    .getByTestId('upload-avatar')
    .setInputFiles(resolve(rootDir, 'tests', 'fixtures', 'smile.png'));
  await page.mouse.click(0, 0);
  await page.getByTestId('workspace-name').click();
  await page.getByTestId('workspace-card').nth(0).click();
  await page.waitForTimeout(1000);
  await page.getByTestId('workspace-name').click();
  await page.getByTestId('workspace-card').nth(1).click();
  const blobUrl = await page
    .getByTestId('workspace-avatar')
    .locator('img')
    .getAttribute('src');
  // out user uploaded avatar
  expect(blobUrl).toContain('blob:');
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});
