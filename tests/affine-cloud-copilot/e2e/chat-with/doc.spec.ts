import { focusDocTitle } from '@affine-test/kit/utils/editor';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIChatWith/Doc', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('support chat with specified doc', async ({
    loggedInPage: page,
    utils,
  }) => {
    // Initialize the doc
    await focusDocTitle(page);
    await page.keyboard.insertText('Test Doc');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('DocEEee is a cute cat');

    await utils.chatPanel.chatWithDoc(page, 'Test Doc');

    await utils.chatPanel.makeChat(page, 'What is DocEEee?');
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is DocEEee?',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/DocEEee/);
    }).toPass({ timeout: 10000 });
  });

  // FIXME: This test is flaky, need to fix it.
  test.skip('support chat with specified docs', async ({
    loggedInPage: page,
    utils,
  }) => {
    // Initialize the doc 1
    await focusDocTitle(page);
    await page.keyboard.insertText('Test Doc1');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('DocEEee is a cute cat');

    // Initialize the doc 2
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    await focusDocTitle(page);
    await page.keyboard.insertText('Test Doc2');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('DocFFff is a cute dog');

    await utils.chatPanel.chatWithDoc(page, 'Test Doc1');
    await utils.chatPanel.chatWithDoc(page, 'Test Doc2');

    await utils.chatPanel.makeChat(page, 'What is DocEEee? What is DocFFff?');
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is DocEEee? What is DocFFff?',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/DocEEee/);
      expect(content).toMatch(/DocFFff/);
    }).toPass({ timeout: 10000 });
  });
});
