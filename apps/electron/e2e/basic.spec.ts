import { platform } from 'node:os';

import { expect } from '@playwright/test';

import { test } from './fixture';

test('new page', async ({ page, workspace }) => {
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  const flavour = (await workspace.current()).flavour;
  expect(flavour).toBe('local');
});

// macOS only
if (platform() === 'darwin') {
  test('app sidebar router forward/back', async ({ page }) => {
    await page.getByTestId('help-island').click();
    await page.getByTestId('easy-guide').click();
    await page.getByTestId('onboarding-modal-next-button').click();
    await page.getByTestId('onboarding-modal-close-button').click();
    {
      // create pages
      await page.waitForTimeout(500);
      await page.getByTestId('new-page-button').click({
        delay: 100,
      });
      await page.waitForSelector('v-line');
      await page.focus('.affine-default-page-block-title');
      await page.type('.affine-default-page-block-title', 'test1', {
        delay: 100,
      });
      await page.waitForTimeout(500);
      await page.getByTestId('new-page-button').click({
        delay: 100,
      });
      await page.waitForSelector('v-line');
      await page.focus('.affine-default-page-block-title');
      await page.type('.affine-default-page-block-title', 'test2', {
        delay: 100,
      });
      await page.waitForTimeout(500);
      await page.getByTestId('new-page-button').click({
        delay: 100,
      });
      await page.waitForSelector('v-line');
      await page.focus('.affine-default-page-block-title');
      await page.type('.affine-default-page-block-title', 'test3', {
        delay: 100,
      });
    }
    {
      const title = (await page
        .locator('.affine-default-page-block-title')
        .textContent()) as string;
      expect(title.trim()).toBe('test3');
    }

    await page.click('[data-testid="app-sidebar-arrow-button-back"]');
    await page.waitForTimeout(1000);
    await page.click('[data-testid="app-sidebar-arrow-button-back"]');
    await page.waitForTimeout(1000);
    {
      const title = (await page
        .locator('.affine-default-page-block-title')
        .textContent()) as string;
      expect(title.trim()).toBe('test1');
    }
    await page.click('[data-testid="app-sidebar-arrow-button-forward"]');
    await page.waitForTimeout(1000);
    await page.click('[data-testid="app-sidebar-arrow-button-forward"]');
    await page.waitForTimeout(1000);
    {
      const title = (await page
        .locator('.affine-default-page-block-title')
        .textContent()) as string;
      expect(title.trim()).toBe('test3');
    }
  });
}

test('app theme', async ({ page, electronApp }) => {
  const root = page.locator('html');
  {
    const themeMode = await root.evaluate(element =>
      element.getAttribute('data-theme')
    );
    expect(themeMode).toBe('light');

    const theme = await electronApp.evaluate(({ nativeTheme }) => {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });

    expect(theme).toBe('light');
  }

  {
    await page.getByTestId('editor-option-menu').click();
    await page.getByTestId('change-theme-dark').click();
    await page.waitForTimeout(50);
    const themeMode = await root.evaluate(element =>
      element.getAttribute('data-theme')
    );
    expect(themeMode).toBe('dark');
    const theme = await electronApp.evaluate(({ nativeTheme }) => {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });
    expect(theme).toBe('dark');
  }
});

test('affine cloud disabled', async ({ page }) => {
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  await page.getByTestId('current-workspace').click();
  await page.getByTestId('sign-in-button').click();
  await page.getByTestId('disable-affine-cloud-modal').waitFor({
    state: 'visible',
  });
});

test('affine onboarding button', async ({ page }) => {
  await page.getByTestId('help-island').click();
  await page.getByTestId('easy-guide').click();
  const onboardingModal = page.locator('[data-testid=onboarding-modal]');
  expect(await onboardingModal.isVisible()).toEqual(true);
  const switchVideo = page.locator(
    '[data-testid=onboarding-modal-switch-video]'
  );
  expect(await switchVideo.isVisible()).toEqual(true);
  await page.getByTestId('onboarding-modal-next-button').click();
  const editingVideo = page.locator(
    '[data-testid=onboarding-modal-editing-video]'
  );
  expect(await editingVideo.isVisible()).toEqual(true);
  await page.getByTestId('onboarding-modal-close-button').click();

  expect(await onboardingModal.isVisible()).toEqual(false);
});

test('windows only check', async ({ page }) => {
  const windowOnlyUI = page.locator('[data-platform-target=win32]');
  if (process.platform === 'win32') {
    await expect(windowOnlyUI).toBeVisible();
  } else {
    await expect(windowOnlyUI).not.toBeVisible();
  }
});

test('delete workspace', async ({ page }) => {
  await page.getByTestId('current-workspace').click();
  await page.getByTestId('add-or-new-workspace').click();
  await page.getByTestId('new-workspace').click();
  await page.getByTestId('create-workspace-default-location-button').click();
  await page.getByTestId('create-workspace-input').type('Delete Me');
  await page.getByTestId('create-workspace-create-button').click();
  await page.getByTestId('create-workspace-continue-button').click();
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await page.getByTestId('current-workspace-label').click();
  expect(await page.getByTestId('workspace-name-input').inputValue()).toBe(
    'Delete Me'
  );
  const contentElement = await page.getByTestId('setting-modal-content');
  const boundingBox = await contentElement.boundingBox();
  if (!boundingBox) {
    throw new Error('boundingBox is null');
  }
  await page.mouse.move(
    boundingBox.x + boundingBox.width / 2,
    boundingBox.y + boundingBox.height / 2
  );
  await page.mouse.wheel(0, 500);
  await page.getByTestId('delete-workspace-button').click();
  await page.getByTestId('delete-workspace-input').type('Delete Me');
  await page.getByTestId('delete-workspace-confirm-button').click();
  await page.waitForTimeout(1000);
  expect(await page.getByTestId('workspace-name').textContent()).toBe(
    'Demo Workspace'
  );
});
