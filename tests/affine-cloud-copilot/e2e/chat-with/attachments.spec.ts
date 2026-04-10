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
    const textContent1 = 'This attachment describes a cute cat.';
    const textContent2 = 'This attachment describes a cute dog.';
    const buffer1 = Buffer.from(textContent1);
    const buffer2 = Buffer.from(textContent2);
    const firstName = 'cat-document.txt';
    const secondName = 'dog-document.txt';

    await utils.chatPanel.chatWithAttachments(
      page,
      [
        {
          name: firstName,
          mimeType: 'text/plain',
          buffer: buffer1,
        },
        {
          name: secondName,
          mimeType: 'text/plain',
          buffer: buffer2,
        },
      ],
      `Which animal is described in ${firstName} and which animal is described in ${secondName}? Answer with both attachment names.`
    );

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: `Which animal is described in ${firstName} and which animal is described in ${secondName}? Answer with both attachment names.`,
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toContain(firstName);
      expect(content).toContain(secondName);
      expect(content).toMatch(/cat/i);
      expect(content).toMatch(/dog/i);
    }).toPass({ timeout: 20000 });
  });
});
