import { ProjectRoot, test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

test('should create a page with a local first avatar and remove it', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await createLocalWorkspace({ name: 'Test Workspace 1' }, page);
  await page.waitForTimeout(1000);
  await page.getByTestId('workspace-name').click();
  await page
    .getByTestId('workspace-card')
    .nth(1)
    .click({ position: { x: 10, y: 10 } });
  await page.getByTestId('settings-modal-trigger').click();
  await page.getByTestId('workspace-setting:preference').click();
  await page
    .getByTestId('upload-avatar')
    .setInputFiles(ProjectRoot.join('tests', 'fixtures', 'blue.png').value);
  await page.mouse.click(0, 0);
  await page.getByTestId('workspace-name').click();
  await page
    .getByTestId('workspace-card')
    .nth(0)
    .getByTestId('workspace-avatar')
    .click();
  await page.waitForTimeout(2000);
  await page.getByTestId('workspace-name').click();
  await page
    .getByTestId('workspace-card')
    .nth(1)
    .getByTestId('workspace-avatar')
    .click();
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
  await page.getByTestId('workspace-setting:preference').click();
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
