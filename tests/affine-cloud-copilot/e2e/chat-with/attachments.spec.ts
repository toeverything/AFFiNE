import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe.configure({ mode: 'serial' });

test.describe('AIChatWith/Attachments', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(
      page,
      'claude-sonnet-4-5@20250929'
    );
    await utils.chatPanel.openChatPanel(page);
  });

  test('support chat with attachment', async ({
    loggedInPage: page,
    utils,
  }) => {
    const textContent = 'AttachmentEEee is a cute cat';
    const buffer = Buffer.from(textContent);

    await utils.chatPanel.chatWithAttachments(
      page,
      [
        {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: buffer,
        },
      ],
      'What is AttachmentEEee?'
    );

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is AttachmentEEee?',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/EEee/);
    }).toPass({ timeout: 10000 });
  });

  test('support chat with multiple attachments', async ({
    loggedInPage: page,
    utils,
  }) => {
    const randomStr1 = Math.random().toString(36).substring(2, 6);
    const randomStr2 = Math.random().toString(36).substring(2, 6);
    const textContent1 = `Attachment${randomStr1} is a cute cat`;
    const textContent2 = `Attachment${randomStr2} is a cute dog`;
    const buffer1 = Buffer.from(textContent1);
    const buffer2 = Buffer.from(textContent2);

    await utils.chatPanel.chatWithAttachments(
      page,
      [
        {
          name: 'document1.txt',
          mimeType: 'text/plain',
          buffer: buffer1,
        },
        {
          name: 'document2.txt',
          mimeType: 'text/plain',
          buffer: buffer2,
        },
      ],
      `What is Attachment${randomStr1}? What is Attachment${randomStr2}?`
    );

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: `What is Attachment${randomStr1}? What is Attachment${randomStr2}?`,
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(new RegExp(`Attachment${randomStr1}`));
      expect(content).toMatch(new RegExp(`Attachment${randomStr2}`));
      expect(await message.locator('affine-footnote-node').count()).toBe(2);
    }).toPass({ timeout: 20000 });
  });
});
