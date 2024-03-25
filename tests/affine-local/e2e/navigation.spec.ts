import { test } from '@affine-test/kit/playwright';
import { withCtrlOrMeta } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const historyShortcut = async (page: Page, command: 'goBack' | 'goForward') => {
  await withCtrlOrMeta(page, () =>
    page.keyboard.press(command === 'goBack' ? '[' : ']', { delay: 300 })
  );
};

test('back and forward buttons', async ({ page }) => {
  await openHomePage(page);

  await expect(page.getByTestId('app-navigation-button-back')).toBeHidden();
  await expect(page.getByTestId('app-navigation-button-forward')).toBeHidden();

  await clickNewPageButton(page);
  await waitForEditorLoad(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.fill('test1');

  await clickSideBarAllPageButton(page);

  await page.getByTestId('workspace-collections-button').click({ delay: 50 });
  await page.waitForURL(url => url.pathname.endsWith('collection'));
  await page.getByTestId('workspace-tags-button').click({ delay: 50 });
  await page.waitForURL(url => url.pathname.endsWith('tag'));

  await page.goBack();
  await page.waitForURL(url => url.pathname.endsWith('collection'));
  await page.goBack();
  await page.waitForURL(url => url.pathname.endsWith('all'));
  await historyShortcut(page, 'goBack');

  await waitForEditorLoad(page);
  await expect(getBlockSuiteEditorTitle(page)).toHaveText('test1');
});
