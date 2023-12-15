import { test } from '@affine-test/kit/electron';
import { withCtrlOrMeta } from '@affine-test/kit/utils/keyboard';
import { getBlockSuiteEditorTitle } from '@affine-test/kit/utils/page-logic';
import {
  clickSideBarCurrentWorkspaceBanner,
  clickSideBarSettingButton,
} from '@affine-test/kit/utils/sidebar';
import { expect, type Page } from '@playwright/test';

const historyShortcut = async (page: Page, command: 'goBack' | 'goForward') => {
  await withCtrlOrMeta(page, () =>
    page.keyboard.press(command === 'goBack' ? '[' : ']', { delay: 50 })
  );
};

test('new page', async ({ page, workspace }) => {
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  const flavour = (await workspace.current()).meta.flavour;
  expect(flavour).toBe('local');
});

// macOS only
// if (platform() === 'darwin') {
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
    const title = getBlockSuiteEditorTitle(page);
    await title.focus();
    await title.pressSequentially('test1', {
      delay: 100,
    });
    await page.waitForTimeout(500);
    await page.getByTestId('new-page-button').click({
      delay: 100,
    });
    await page.waitForSelector('v-line');

    await title.focus();
    await title.pressSequentially('test2', {
      delay: 100,
    });
    await page.waitForTimeout(500);
    await page.getByTestId('new-page-button').click({
      delay: 100,
    });
    await page.waitForSelector('v-line');
    await title.focus();
    await title.pressSequentially('test3', {
      delay: 100,
    });
  }
  {
    await expect(page.locator('.affine-doc-page-block-title')).toHaveText(
      'test3'
    );
  }

  await page.click('[data-testid="app-sidebar-arrow-button-back"]');
  await page.click('[data-testid="app-sidebar-arrow-button-back"]');
  {
    await expect(page.locator('.affine-doc-page-block-title')).toHaveText(
      'test1'
    );
  }
  await page.click('[data-testid="app-sidebar-arrow-button-forward"]');
  await page.click('[data-testid="app-sidebar-arrow-button-forward"]');
  {
    await expect(page.locator('.affine-doc-page-block-title')).toHaveText(
      'test3'
    );
  }
  await historyShortcut(page, 'goBack');
  await historyShortcut(page, 'goBack');
  {
    await expect(page.locator('.affine-doc-page-block-title')).toHaveText(
      'test1'
    );
  }
  await historyShortcut(page, 'goForward');
  await historyShortcut(page, 'goForward');
  {
    await expect(page.locator('.affine-doc-page-block-title')).toHaveText(
      'test3'
    );
  }
});
// }

test('clientBorder value should disable by default on window', async ({
  page,
}) => {
  await clickSideBarSettingButton(page);
  await page.waitForTimeout(1000);
  const settingItem = page.locator(
    '[data-testid="client-border-style-trigger"]'
  );
  expect(await settingItem.locator('input').inputValue()).toEqual(
    process.platform === 'win32' ? 'off' : 'on'
  );
});

test('app theme', async ({ page, electronApp }) => {
  const root = page.locator('html');
  {
    const themeMode = await root.evaluate(element => element.dataset.theme);
    expect(themeMode).toBe('light');

    const theme = await electronApp.evaluate(({ nativeTheme }) => {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });

    expect(theme).toBe('light');
  }

  {
    await page.getByTestId('settings-modal-trigger').click();
    await page.getByTestId('appearance-panel-trigger').click();
    await page.waitForTimeout(50);
    await page.getByTestId('dark-theme-trigger').click();
    const themeMode = await root.evaluate(element => element.dataset.theme);
    expect(themeMode).toBe('dark');
    const theme = await electronApp.evaluate(({ nativeTheme }) => {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });
    expect(theme).toBe('dark');
  }
});

test('affine onboarding button', async ({ page }) => {
  await page.getByTestId('help-island').click();
  await page.getByTestId('easy-guide').click();
  const onboardingModal = page.locator('[data-testid=onboarding-modal]');
  await expect(onboardingModal).toBeVisible();
  const switchVideo = page.locator(
    '[data-testid=onboarding-modal-switch-video]'
  );
  await expect(switchVideo).toBeVisible();
  await page.getByTestId('onboarding-modal-next-button').click();
  const editingVideo = page.locator(
    '[data-testid=onboarding-modal-editing-video]'
  );
  await expect(editingVideo).toBeVisible();
  await page.getByTestId('onboarding-modal-close-button').click();

  await expect(onboardingModal).toBeHidden();
});

test('windows only check', async ({ page }) => {
  const windowOnlyUI = page.locator('[data-platform-target=win32]');
  if (process.platform === 'win32') {
    await expect(windowOnlyUI.first()).toBeVisible();
  } else {
    await expect(windowOnlyUI.first()).not.toBeVisible();
  }
});

test('delete workspace', async ({ page }) => {
  await clickSideBarCurrentWorkspaceBanner(page);
  await page.getByTestId('new-workspace').click();
  await page.getByTestId('create-workspace-input').fill('Delete Me');
  await page.getByTestId('create-workspace-create-button').click();
  // await page.getByTestId('create-workspace-continue-button').click({
  //   delay: 100,
  // });
  await page.waitForTimeout(1000);
  await clickSideBarSettingButton(page);
  await page.getByTestId('current-workspace-label').click();
  expect(await page.getByTestId('workspace-name-input').inputValue()).toBe(
    'Delete Me'
  );
  const contentElement = page.getByTestId('setting-modal-content');
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
  await page.getByTestId('delete-workspace-input').fill('Delete Me');
  await page.getByTestId('delete-workspace-confirm-button').click();
  await page.waitForTimeout(1000);
  expect(await page.getByTestId('workspace-name').textContent()).toBe(
    'Demo Workspace'
  );
});
