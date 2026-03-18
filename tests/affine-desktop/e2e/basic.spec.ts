import { test } from '@affine-test/kit/electron';
import {
  ensureInEdgelessMode,
  ensureInPageMode,
} from '@affine-test/kit/utils/editor';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarSettingButton } from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const historyShortcut = async (page: Page, command: 'goBack' | 'goForward') => {
  await page.keyboard.press(
    command === 'goBack' ? 'ControlOrMeta+[' : 'ControlOrMeta+]'
  );
};

const setNewDocDefaultMode = async (
  page: Page,
  mode: 'page' | 'edgeless' | 'ask'
) => {
  const modeTriggerByValue = {
    page: 'page-mode-trigger',
    edgeless: 'edgeless-mode-trigger',
    ask: 'ask-every-time-trigger',
  } as const;

  await clickSideBarSettingButton(page);
  await page.getByTestId('editor-panel-trigger').click();
  await page.getByTestId('new-doc-default-mode-trigger').click();
  await page.getByTestId(modeTriggerByValue[mode]).click();
  await page.getByTestId('modal-close-button').click();
};

test('new page', async ({ page, workspace }) => {
  await clickNewPageButton(page);
  const flavour = (await workspace.current()).meta.flavour;
  expect(flavour).toBe('local');
});

test('application menu respects default new doc mode', async ({
  electronApp,
  page,
}) => {
  await waitForEditorLoad(page);
  await ensureInPageMode(page);

  await setNewDocDefaultMode(page, 'edgeless');
  await electronApp.evaluate(({ BrowserWindow, Menu }) => {
    const menuItem =
      Menu.getApplicationMenu()?.getMenuItemById('affine:new-page');
    const focusedWindow = BrowserWindow.getFocusedWindow();

    if (!menuItem) {
      throw new Error('Missing application menu item: affine:new-page');
    }
    if (!focusedWindow) {
      throw new Error('Missing focused window for application menu dispatch');
    }

    menuItem.click(undefined, focusedWindow, focusedWindow.webContents);
  });

  await ensureInEdgelessMode(page);
});

test('app sidebar router forward/back', async ({ page }) => {
  // create pages
  await page.waitForTimeout(500);
  await clickNewPageButton(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.focus();
  await title.pressSequentially('test1', {
    delay: 100,
  });
  await page.waitForTimeout(500);
  await clickNewPageButton(page);

  await title.focus();
  await title.pressSequentially('test2', {
    delay: 100,
  });
  await page.waitForTimeout(500);
  await clickNewPageButton(page);
  await title.focus();
  await title.pressSequentially('test3', {
    delay: 100,
  });
  await expect(getBlockSuiteEditorTitle(page)).toHaveText('test3');

  await page.click('[data-testid="app-navigation-button-back"]');
  await page.click('[data-testid="app-navigation-button-back"]');
  await expect(getBlockSuiteEditorTitle(page)).toHaveText('test1');
  await page.click('[data-testid="app-navigation-button-forward"]');
  await page.click('[data-testid="app-navigation-button-forward"]');
  await expect(getBlockSuiteEditorTitle(page)).toHaveText('test3');
  await historyShortcut(page, 'goBack');
  await historyShortcut(page, 'goBack');
  await expect(getBlockSuiteEditorTitle(page)).toHaveText('test1');
  await historyShortcut(page, 'goForward');
  await historyShortcut(page, 'goForward');
  await expect(getBlockSuiteEditorTitle(page)).toHaveText('test3');
});

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

test('windows only check', async ({ page }) => {
  const windowOnlyUI = page.locator('[data-platform-target=win32]');
  if (process.platform === 'win32') {
    await expect(windowOnlyUI.first()).toBeVisible();
  } else {
    await expect(windowOnlyUI.first()).not.toBeVisible();
  }
});

test('delete workspace', async ({ page }) => {
  await clickNewPageButton(page);

  await createLocalWorkspace({ name: 'Delete Me' }, page);
  await page.waitForTimeout(1000);
  await clickSideBarSettingButton(page);
  await page.getByTestId('workspace-setting:preference').click();
  await expect(page.getByTestId('workspace-name-input')).toHaveValue(
    'Delete Me'
  );
  await page.getByTestId('delete-workspace-button').click();
  await page.getByTestId('delete-workspace-input').fill('Delete Me');
  await page.getByTestId('delete-workspace-confirm-button').click();
  await expect(page.getByTestId('workspace-name')).toContainText(
    'Demo Workspace'
  );
});
