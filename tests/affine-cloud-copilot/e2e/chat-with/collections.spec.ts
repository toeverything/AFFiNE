import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe.configure({ mode: 'serial' });

test.describe('AIChatWith/Collections', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
    await utils.editor.clearAllCollections(page);

    await utils.testUtils.createNewPage(page);
  });

  test.afterEach(async ({ loggedInPage: page, utils }) => {
    // clear all collections
    await utils.editor.clearAllCollections(page);
  });

  test('should support chat with collection', async ({
    loggedInPage: page,
    utils,
  }) => {
    const randomStr = Math.random().toString(36).substring(2, 6);
    // Create two collections
    await utils.editor.createCollectionAndDoc(
      page,
      'Collection 1',
      `Collection${randomStr} is a cute dog`
    );

    await utils.chatPanel.chatWithCollections(page, ['Collection 1']);
    await utils.settings.openSettingsPanel(page);
    await utils.settings.disableWorkspaceEmbedding(page);
    await utils.settings.closeSettingsPanel(page);
    await utils.chatPanel.makeChat(
      page,
      `What is Collection${randomStr}? Use English and answer with a citation.`
    );
    await expect(
      page.getByText(
        'One or more selected sources are unavailable. Check the sources or workspace AI indexing settings, then retry.'
      )
    ).toBeVisible();
    expect(
      (await utils.chatPanel.collectHistory(page)).filter(
        message => message.role === 'user'
      )
    ).toHaveLength(1);
    await utils.settings.openSettingsPanel(page);
    await utils.settings.enableWorkspaceEmbedding(page);
    await utils.settings.closeSettingsPanel(page);
    await page.getByTestId('ai-error-action-button').click();
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: `What is Collection${randomStr}? Use English and answer with a citation.`,
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(new RegExp(`Collection${randomStr}.*dog`));
      expect(
        await message.locator('affine-footnote-node').count()
      ).toBeGreaterThanOrEqual(1);
    }).toPass();
  });

  test('should support chat with multiple collections', async ({
    loggedInPage: page,
    utils,
  }) => {
    const randomStr1 = Math.random().toString(36).substring(2, 6);
    const randomStr2 = Math.random().toString(36).substring(2, 6);
    // Create two collections
    await utils.editor.createCollectionAndDoc(
      page,
      'Collection 2',
      `Collection${randomStr1} is a cute cat`
    );

    await utils.editor.createCollectionAndDoc(
      page,
      'Collection 3',
      `Collection${randomStr2} is a cute dog`
    );

    await utils.chatPanel.chatWithCollections(page, [
      'Collection 2',
      'Collection 3',
    ]);
    await utils.chatPanel.makeChat(
      page,
      `What is Collection${randomStr1}? What is Collection${randomStr2}? Use English and cite both sources.`
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: `What is Collection${randomStr1}? What is Collection${randomStr2}? Use English and cite both sources.`,
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(new RegExp(`Collection${randomStr1}.*cat`));
      expect(content).toMatch(new RegExp(`Collection${randomStr2}.*dog`));
      expect(
        await message.locator('affine-footnote-node').count()
      ).toBeGreaterThanOrEqual(2);
    }).toPass();
  });
});
