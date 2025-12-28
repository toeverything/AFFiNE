import { copyByKeyboard } from '@affine-test/kit/utils/keyboard';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIBasic/Chat', () => {
  test.beforeEach(async ({ utils, loggedInPage: page }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should display empty state when no messages', async ({
    loggedInPage: page,
  }) => {
    // Verify empty state UI
    await expect(page.getByTestId('chat-panel-empty-state')).toBeVisible();
    await expect(page.getByTestId('ai-onboarding')).toBeVisible();
  });

  // test('should open embedding settings when clicking check status button', async ({
  //   loggedInPage: page,
  //   utils,
  // }) => {
  //   await utils.editor.createDoc(page, 'Doc 1', 'doc1');
  //   await utils.editor.createDoc(page, 'Doc 2', 'doc2');
  //   await utils.editor.createDoc(page, 'Doc 3', 'doc3');
  //   await utils.editor.createDoc(page, 'Doc 4', 'doc4');
  //   await utils.editor.createDoc(page, 'Doc 5', 'doc5');

  //   const check = await page.getByTestId(
  //     'ai-chat-embedding-status-tooltip-check'
  //   );
  //   await expect(check).toBeVisible({ timeout: 50 * 1000 });

  //   await check.click();
  //   await expect(page.getByTestId('workspace-setting:embedding')).toBeVisible();
  // });

  test(`should send message and receive AI response:
        - send message
        - AI is loading
        - AI generating
        - AI success
    `, async ({ loggedInPage: page, utils }) => {
    // Type and send a message
    await utils.chatPanel.makeChat(
      page,
      'Introduce AFFiNE to me. Answer in 500 words.'
    );

    if (!(await page.getByTestId('ai-loading').isVisible())) {
      // AI is loading
      await utils.chatPanel.waitForHistory(page, [
        {
          role: 'user',
          content: 'Introduce AFFiNE to me. Answer in 500 words.',
        },
        {
          role: 'assistant',
          status: 'loading',
        },
      ]);

      await expect(page.getByTestId('ai-loading')).toBeVisible();
    }

    // AI Generating
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Introduce AFFiNE to me. Answer in 500 words.',
      },
      {
        role: 'assistant',
        status: 'transmitting',
      },
    ]);

    await expect(page.getByTestId('ai-loading')).not.toBeVisible();

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Introduce AFFiNE to me. Answer in 500 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
  });

  test('should support stop generating', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.makeChat(
      page,
      'Introduce AFFiNE to me. Answer in 5000 words.'
    );

    // AI Generating
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Introduce AFFiNE to me. Answer in 5000 words.',
      },
      {
        role: 'assistant',
        status: 'transmitting',
      },
    ]);

    await page.getByTestId('chat-panel-stop').click();
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Introduce AFFiNE to me. Answer in 5000 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
  });

  test('should render ai actions inline if the answer is the last one in the list, otherwise, nest them under the "More" menu', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.makeChat(
      page,
      'Hello, how can you help me? Answer in 50 words.'
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Hello, how can you help me? Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(page.getByTestId('chat-action-list')).toBeVisible();
    await utils.chatPanel.makeChat(
      page,
      'Nice to meet you. Answer in 50 words.'
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Hello, how can you help me? Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'idle',
      },
      {
        role: 'user',
        content: 'Nice to meet you. Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    const firstAnswer = await page
      .getByTestId('chat-message-assistant')
      .first();
    const more = firstAnswer.getByTestId('action-more-button');
    await more.click();
    await expect(firstAnswer.getByTestId('chat-actions')).toBeVisible();
  });

  test('should show error when request failed', async ({
    loggedInPage: page,
    utils,
  }) => {
    // Simulate network error by disconnecting
    await page.route('**/graphql', route => route.abort('failed'));

    // Send a message that will fail
    await utils.chatPanel.makeChat(page, 'Hello. Answer in 50 words.');

    await expect(page.getByTestId('ai-error')).toBeVisible();
    await expect(page.getByTestId('action-retry-button')).toBeVisible();
  });

  test('should support retrying failed messages', async ({
    loggedInPage: page,
    utils,
  }) => {
    // Simulate network error by disconnecting
    await page.route('**/graphql', route => route.abort('failed'));

    // Send a message that will fail
    await utils.chatPanel.makeChat(page, 'Hello. Answer in 50 words.');

    // Verify error state
    await expect(page.getByTestId('ai-error')).toBeVisible();

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Hello. Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'error',
      },
    ]);

    // Reconnect network
    await page.route('**/graphql', route => route.continue());

    await page.getByTestId('action-retry-button').click();

    // Verify message is resent and AI responds
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Hello. Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
  });

  test('should support retrying question', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.makeChat(
      page,
      'Introduce Large Language Model. Answer in 50 words.'
    );

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Introduce Large Language Model. Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    const { actions } = await utils.chatPanel.getLatestAssistantMessage(page);
    await actions.retry();

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Introduce Large Language Model. Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
  });

  test('should support sending message with button', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.openChatPanel(page);
    await utils.chatPanel.typeChat(page, 'Hello');
    await page.getByTestId('chat-panel-send').click();
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Hello',
      },
      {
        role: 'assistant',
        status: 'loading',
      },
    ]);
  });

  test('should support copying answer', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.openChatPanel(page);
    await utils.chatPanel.makeChat(page, 'Hello. Answer in 50 words.');
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Hello. Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    const { actions } = await utils.chatPanel.getLatestAssistantMessage(page);
    await actions.copy();
    await page.getByText('Copied to clipboard').isVisible();
    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText()
      );
      expect(clipboardText).toBe(content);
    }).toPass({ timeout: 5000 });
  });

  test('should support copying selected answer content', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.openChatPanel(page);
    await utils.chatPanel.makeChat(
      page,
      'Help me write a two-line love poem. Answer in 50 words.'
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Help me write a two-line love poem. Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      // Select multiple rich text
      const firstParagraph = await message
        .locator('affine-paragraph rich-text v-text')
        .first()
        .boundingBox();
      const lastParagraph = await message
        .locator('affine-paragraph rich-text v-text')
        .last()
        .boundingBox();

      if (firstParagraph && lastParagraph) {
        await page.mouse.move(firstParagraph.x, firstParagraph.y);
        await page.mouse.down();
        await page.mouse.move(
          lastParagraph.x + lastParagraph.width,
          lastParagraph.y + lastParagraph.height
        );
        await page.mouse.up();
      }

      await copyByKeyboard(page);
      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText()
      );
      expect(clipboardText).toBe(content);
    }).toPass({ timeout: 5000 });
  });

  test('chat with ask ai input in page mode', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.closeChatPanel(page);
    await utils.editor.askAIWithText(
      page,
      'AFFiNE is an open source all in one workspace.'
    );
    await page.keyboard.type('Translate to chinese.');

    const sendButton = await page.getByTestId('ai-panel-input-send');
    await expect(sendButton).toHaveAttribute('data-active', 'true');
    await sendButton.click();

    await expect(page.getByTestId('sidebar-tab-content-chat')).toBeVisible();
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content:
          'AFFiNE is an open source all in one workspace.\nTranslate to chinese.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
  });

  test('chat with ask ai input in edgeless mode', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.closeChatPanel(page);
    await utils.editor.askAIWithEdgeless(page, async () => {
      await utils.editor.createShape(page, 'HelloWorld');
    });
    await page.waitForTimeout(1000);
    await page.keyboard.type('What color is it? Answer in 50 words.');

    await page.waitForTimeout(1000);
    const sendButton = await page.getByTestId('ai-panel-input-send');
    await expect(sendButton).toHaveAttribute('data-active', 'true');
    await sendButton.click();

    await expect(page.getByTestId('sidebar-tab-content-chat')).toBeVisible();
    await expect(page.locator('chat-content-images')).toBeVisible();
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What color is it? Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
  });

  test('should support chat with ask ai input in edgeless mode when nothing selected', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.closeChatPanel(page);
    await utils.editor.switchToEdgelessMode(page);
    await utils.editor.removeAll(page);

    await page.mouse.move(300, 300);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(350, 350);
    await page.mouse.up({ button: 'right' });

    await utils.chatPanel.openChatPanel(page);
    await utils.chatPanel.makeChat(page, 'Who are you? Answer in 50 words.');
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Who are you? Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
  });

  test('should support create a new chat after ask ai', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.closeChatPanel(page);
    await utils.editor.askAIWithText(
      page,
      'AFFiNE is an open source all in one workspace.'
    );
    await page.keyboard.type('Translate to chinese.');

    const sendButton = await page.getByTestId('ai-panel-input-send');
    await expect(sendButton).toHaveAttribute('data-active', 'true');
    await sendButton.click();

    await expect(page.getByTestId('sidebar-tab-content-chat')).toBeVisible();
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content:
          'AFFiNE is an open source all in one workspace.\nTranslate to chinese.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await page.getByTestId('ai-panel-new-chat').click();
    await page.waitForTimeout(1000);
    await utils.chatPanel.expectToHaveHistory(page, []);
  });

  test('should support pin chat', async ({ loggedInPage: page, utils }) => {
    await utils.chatPanel.openChatPanel(page);
    await utils.chatPanel.makeChat(
      page,
      'Hello, how can you help me? Answer in 50 words.'
    );

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Hello, how can you help me? Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    // pinned
    await expect(page.getByTestId('ai-panel-pin-chat')).toHaveAttribute(
      'data-pinned',
      'false'
    );
    await page.getByTestId('ai-panel-pin-chat').click();
    await expect(page.getByTestId('ai-panel-pin-chat')).toHaveAttribute(
      'data-pinned',
      'true'
    );

    // create new doc
    await utils.editor.createDoc(page, 'Doc 1', 'doc1');
    await utils.chatPanel.expectToHaveHistory(page, [
      {
        role: 'user',
        content: 'Hello, how can you help me? Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'idle',
      },
    ]);
    await page.getByTestId('ai-panel-pin-chat').click();

    // unpinned
    await expect(page.getByTestId('ai-panel-pin-chat')).toHaveAttribute(
      'data-pinned',
      'false'
    );
    await utils.editor.createDoc(page, 'Doc 2', 'doc2');
    await utils.chatPanel.expectToHaveHistory(page, []);
  });
});
