import { focusDocTitle } from '@affine-test/kit/utils/editor';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIInsertion/Insert', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should insert content below selected block in page mode', async ({
    loggedInPage: page,
    utils,
  }) => {
    // Create tow blocks
    // - Hello Block
    // - World Block
    await utils.editor.focusToEditor(page);
    await page.keyboard.insertText('Hello Block');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('World Block');

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

    // Focus to Hello
    // - Hello<cursor />
    await page.getByText('Hello Block').click();

    const { actions } = await utils.chatPanel.getLatestAssistantMessage(page);
    await actions.insert();

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      const editorContent = await utils.editor.getEditorContent(page);
      expect(editorContent).toBe(`Hello Block\n${content}\nWorld Block`);
    }).toPass({ timeout: 5000 });
  });

  test('should insert content below selected block in edgeless mode', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.switchToEdgelessMode(page);
    await utils.editor.focusToEditor(page);
    await page.keyboard.insertText('Hello Block');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('World Block');

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

    // Focus to Hello
    // - Hello<cursor />
    await page.locator('affine-edgeless-note').dblclick();
    await page.getByText('Hello Block').click();

    const { actions } = await utils.chatPanel.getLatestAssistantMessage(page);
    await actions.insert();

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      const noteContent = await utils.editor.getNoteContent(page);
      expect(noteContent).toBe(`Hello Block\n${content}\nWorld Block`);
    }).toPass({ timeout: 5000 });
  });

  test('should insert content at the end of the page when no block is selected', async ({
    loggedInPage: page,
    utils,
  }) => {
    // Create tow blocks
    // - Hello Block
    // - World Block
    await utils.editor.focusToEditor(page);
    await page.keyboard.insertText('Hello Block');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('World Block');

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

    // Focus Doc Title
    // - Hello<cursor />
    await focusDocTitle(page);

    const { actions } = await utils.chatPanel.getLatestAssistantMessage(page);
    await actions.insert();

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      const editorContent = await utils.editor.getEditorContent(page);
      expect(editorContent).toBe(`Hello Block\nWorld Block\n${content}`);
    }).toPass({ timeout: 5000 });
  });

  test('should insert content at the end of the note when no block is selected in edgeless mode', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.switchToEdgelessMode(page);
    await utils.editor.focusToEditor(page);
    await page.keyboard.insertText('Hello Block');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('World Block');

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
    await actions.insert();

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      const noteContent = await utils.editor.getNoteContent(page);
      expect(noteContent).toBe(`Hello Block\nWorld Block\n${content}`);
    }).toPass({ timeout: 5000 });
  });

  test('should create a new note when no block or note is selected in edgeless mode', async ({
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
    await actions.insert();

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      const noteContent = await utils.editor.getNoteContent(page);
      expect(noteContent).toBe(content);
    }).toPass({ timeout: 5000 });
  });
});
