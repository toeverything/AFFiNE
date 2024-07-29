import { test } from '@affine-test/kit/playwright';
import {
  createRandomAIUser,
  loginUser,
  loginUserDirectly,
} from '@affine-test/kit/utils/cloud';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect, type Page } from '@playwright/test';

test('can open chat side panel', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await page.getByTestId('right-sidebar-toggle').click({
    delay: 200,
  });
  await page.getByTestId('sidebar-tab-chat').click();
  await expect(page.getByTestId('sidebar-tab-content-chat')).toBeVisible();
});

const makeChat = async (page: Page, content: string) => {
  if (await page.getByTestId('sidebar-tab-chat').isHidden()) {
    await page.getByTestId('right-sidebar-toggle').click({
      delay: 200,
    });
  }
  await page.getByTestId('sidebar-tab-chat').click();
  await page.getByTestId('chat-panel-input').focus();
  await page.keyboard.type(content);
  await page.keyboard.press('Enter');
};

const collectChat = async (page: Page) => {
  const chatPanel = await page.waitForSelector('.chat-panel-messages');
  return Promise.all(
    Array.from(await chatPanel.$$('.message')).map(async m => ({
      name: await (await m.$('.user-info'))?.innerText(),
      content: await (
        await (await m.$('ai-answer-text'))?.$('editor-host')
      )?.innerText(),
    }))
  );
};

test('can trigger login at chat side panel', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await makeChat(page, 'hello');
  const loginTips = await page.waitForSelector('ai-error-wrapper');
  expect(await loginTips.innerText()).toBe('Login');
});

test('can chat after login at chat side panel', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await makeChat(page, 'hello');
  const loginTips = await page.waitForSelector('ai-error-wrapper');
  (await loginTips.$('div'))!.click();
  // login
  const user = await createRandomAIUser();
  await loginUserDirectly(page, user.email);
  // after login
  await makeChat(page, 'hello');
  const history = await collectChat(page);
  expect(history[0]).toEqual({ name: 'You', content: 'hello' });
  expect(history[1].name).toBe('AFFINE AI');
});

test.describe('chat panel', () => {
  let user: {
    id: string;
    name: string;
    email: string;
    password: string;
  };

  test.beforeEach(async ({ page }) => {
    user = await createRandomAIUser();
    await loginUser(page, user.email);
  });

  test('start chat', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await makeChat(page, 'hello');
    const history = await collectChat(page);
    expect(history[0]).toEqual({ name: 'You', content: 'hello' });
    expect(history[1].name).toBe('AFFINE AI');
  });
});
