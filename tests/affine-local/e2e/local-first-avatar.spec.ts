import { resolve } from 'node:path';

import { rootDir, test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('should create a page with a local first avatar and remove it', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await page.getByTestId('workspace-name').click();
  await page.getByTestId('new-workspace').click();
  await page.getByTestId('create-workspace-input').fill('Test Workspace 1');
  await page.getByTestId('create-workspace-create-button').click();
  await page.waitForTimeout(1000);
  await page.getByTestId('workspace-name').click();
  await page
    .getByTestId('workspace-card')
    .nth(1)
    .click({ position: { x: 10, y: 10 } });
  await page.getByTestId('settings-modal-trigger').click();
  await page.getByTestId('current-workspace-label').click();
  await page
    .getByTestId('upload-avatar')
    .setInputFiles(resolve(rootDir, 'tests', 'fixtures', 'blue.png'));
  await page.mouse.click(0, 0);
  await page.getByTestId('workspace-name').click();
  await page.getByTestId('workspace-card').nth(0).click();
  await page.waitForTimeout(1000);
  await page.getByTestId('workspace-name').click();
  await page.getByTestId('workspace-card').nth(1).click();
  const avatarCanvas = await page
    .getByTestId('workspace-avatar')
    .locator('canvas')
    .first()
    .elementHandle();
  const avatarPixelData = await page.evaluate(
    ({ avatarCanvas }) => {
      return Array.from(
        (avatarCanvas as HTMLCanvasElement)
          .getContext('2d')!
          .getImageData(1, 1, 1, 1).data // get pixel data of the avatar
      );
    },
    { avatarCanvas }
  );
  expect(avatarPixelData).toEqual([0, 0, 255, 255]); // blue color

  // Click remove button to remove workspace avatar
  await page.getByTestId('settings-modal-trigger').click();
  await page.getByTestId('current-workspace-label').click();
  await page.getByTestId('workspace-setting-avatar').hover();
  await page.getByTestId('workspace-setting-remove-avatar-button').click();
  await page.mouse.click(0, 0);
  await page.waitForTimeout(1000);
  await page.getByTestId('workspace-name').click();
  await page.getByTestId('workspace-card').nth(1).click();
  const removedAvatarImage = await page
    .getByTestId('workspace-avatar')
    .locator('canvas')
    .count();
  expect(removedAvatarImage).toBe(0);

  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});
