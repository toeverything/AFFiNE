import { IS_MAC } from '@blocksuite/global/env';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIChatWith/Text', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support stop generating', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.askAIWithText(page, 'Appel');
    await page.getByTestId('action-fix-grammar').click();
    await expect(page.getByTestId('ai-generating')).toBeVisible();
    const stop = await page.getByTestId('ai-stop');
    await stop.click();
    await expect(page.getByTestId('ai-generating')).not.toBeVisible();
  });

  test('should support stop generating when click outside', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.askAIWithText(page, 'Panda');
    await page.getByTestId('action-generate-image').click();
    await expect(page.getByTestId('ai-generating')).toBeVisible();
    await page.mouse.click(0, 0);
    await expect(
      page.getByText('AI is generating content. Do you want to stop generating')
    ).toBeVisible();
    await page.getByTestId('confirm-modal-confirm').click();
    await expect(page.getByTestId('ai-generating')).not.toBeVisible();
  });

  test('should support copy answer', async ({ loggedInPage: page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('Simplified Chinese');
    await expect(answer).toHaveText(/苹果/, { timeout: 10000 });
    const copy = answer.getByTestId('answer-copy-button');
    await copy.click();
    await expect(answer.getByTestId('answer-copied')).toBeVisible();
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText()
    );
    expect(clipboardText).toBe('苹果');
  });

  test('should support insert below', async ({ loggedInPage: page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('Simplified Chinese');
    await expect(answer).toHaveText(/苹果/, { timeout: 10000 });
    const insertBelow = answer.getByTestId('answer-insert-below');
    await insertBelow.click();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('Apple\n苹果');
  });

  test('should support insert above', async ({ loggedInPage: page, utils }) => {
    const { generateHeadings } = await utils.editor.askAIWithText(
      page,
      'AFFiNE'
    );
    const { answer } = await generateHeadings();
    await answer.locator('h1').isVisible();
    await expect(answer).toHaveText(/AFFiNE/, { timeout: 10000 });

    const insertAbove = answer.getByTestId('answer-insert-above');
    await insertAbove.click();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('AFFiNE\nAFFiNE');
  });

  test('should support replace selection', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.focusToEditor(page);
    await page.keyboard.insertText('I Loev Apple');

    // Select the word "Loev"
    const SHORT_KEY = IS_MAC ? 'Alt' : 'Control';
    await page.keyboard.press(`${SHORT_KEY}+ArrowLeft`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press(`Shift+${SHORT_KEY}+ArrowLeft`);

    const { fixSpelling } = await utils.editor.showAIMenu(page);
    const { answer } = await fixSpelling();
    await expect(answer).toHaveText(/Love/, { timeout: 10000 });
    const replace = answer.getByTestId('answer-replace');
    await replace.click();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('I Love Apple');
  });

  test('should support continue in chat', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('Simplified Chinese');
    await expect(answer).toHaveText(/苹果/, { timeout: 10000 });
    const continueInChat = answer.getByTestId('answer-continue-in-chat');
    await continueInChat.click();
    const chatPanelInput = await page.getByTestId('chat-panel-input-container');
    const quote = await chatPanelInput.getByTestId('chat-selection-quote');
    await expect(quote).toHaveText(/Apple/, { timeout: 10000 });
  });

  test('should support regenerate', async ({ loggedInPage: page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('Simplified Chinese');
    const regenerate = answer.getByTestId('answer-regenerate');
    await regenerate.click();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('Apple');
  });

  test('should show error when request failed', async ({
    loggedInPage: page,
    utils,
  }) => {
    await page.route('**/graphql', route => route.abort('failed'));
    await utils.editor.askAIWithText(page, 'Appel');
    await page.getByTestId('action-fix-spelling').click();
    await expect(page.getByTestId('ai-error')).toBeVisible();
  });

  test('should support retry when error', async ({
    loggedInPage: page,
    utils,
  }) => {
    await page.route('**/graphql', route => route.abort('failed'));
    await utils.editor.askAIWithText(page, 'Appel');
    await page.getByTestId('action-fix-spelling').click();
    const aiPanelContainer = await page.getByTestId('ai-panel-container');

    await page.route('**/graphql', route => route.continue());
    await aiPanelContainer.getByTestId('error-retry').click();
    const answer = await utils.editor.waitForAiAnswer(page);
    await expect(answer).toHaveText(/Apple/, { timeout: 10000 });
  });

  test('should support discard', async ({ loggedInPage: page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('Simplified Chinese');
    const discard = answer.getByTestId('answer-discard');
    await discard.click();
    await expect(answer).not.toBeVisible();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('Apple');
  });

  test('should support discard when click outside', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('Simplified Chinese');
    await page.mouse.click(0, 0);
    await expect(page.getByText('Discard the AI result')).toBeVisible();
    await page.getByTestId('confirm-modal-confirm').click();
    await expect(answer).not.toBeVisible();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('Apple');
  });

  test('should focus on textarea', async ({ loggedInPage: page, utils }) => {
    await utils.editor.askAIWithText(page, 'Apple');

    const textarea = await utils.editor.whatAreYourThoughts(page, 'Coffee');

    await expect(textarea).toBeFocused();

    const value = await textarea.inputValue();
    expect(value).toBe('Coffee');
  });
});
