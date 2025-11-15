import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIInsertion/AddToEdgelessAsNote', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should only show option in edgeless mode', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.focusToEditor(page);
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

    await expect(
      page.getByTestId('action-add-to-edgeless-as-note')
    ).not.toBeVisible();

    await utils.editor.switchToEdgelessMode(page);
    await expect(
      page.getByTestId('action-add-to-edgeless-as-note')
    ).toBeVisible();
  });

  test('should add to edgeless as note  in edgeless mode', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.switchToEdgelessMode(page);

    // Delete default note
    await (await page.waitForSelector('affine-edgeless-note')).click();
    await page.keyboard.press('Delete');

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
    await actions.addAsNote();
    await page.getByText('New note created');

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      const noteContent = await utils.editor.getNoteContent(page);
      expect(noteContent).toBe(content);
    }).toPass({ timeout: 5000 });
  });
});
