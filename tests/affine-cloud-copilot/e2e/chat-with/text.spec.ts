import { loginUser } from '@affine-test/kit/utils/cloud';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIChatWith/Text', () => {
  test.beforeEach(async ({ page, utils }) => {
    const user = await utils.testUtils.getUser();
    await loginUser(page, user);
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support stop generating', async ({ page, utils }) => {
    await utils.editor.askAIWithText(page, 'Appel');
    await page.getByTestId('action-fix-grammar').click();
    await expect(page.getByTestId('ai-generating')).toBeVisible();
    const stop = await page.getByTestId('ai-stop');
    await stop.click();
    await expect(page.getByTestId('ai-generating')).not.toBeVisible();
  });

  test('should support copy answer', async ({ page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('German');
    await expect(answer).toHaveText(/Apfel/, { timeout: 10000 });
    const copy = answer.getByTestId('answer-copy-button');
    await copy.click();
    await expect(answer.getByTestId('answer-copied')).toBeVisible();
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText()
    );
    expect(clipboardText).toBe('Apfel');
  });

  test('should support insert below', async ({ page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('German');
    await expect(answer).toHaveText(/Apfel/, { timeout: 10000 });
    const insertBelow = answer.getByTestId('answer-insert-below');
    await insertBelow.click();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('Apple\nApfel');
  });

  test('should support insert above', async ({ page, utils }) => {
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

  test('should support replace selection', async ({ page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('German');
    await expect(answer).toHaveText(/Apfel/, { timeout: 10000 });
    const replace = answer.getByTestId('answer-replace');
    await replace.click();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('Apfel');
  });

  test('should support continue in chat', async ({ page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('German');
    await expect(answer).toHaveText(/Apfel/, { timeout: 10000 });
    const continueInChat = answer.getByTestId('answer-continue-in-chat');
    await continueInChat.click();
    const chatPanelInput = await page.getByTestId('chat-panel-input-container');
    const quote = await chatPanelInput.getByTestId('chat-selection-quote');
    await expect(quote).toHaveText(/Apple/, { timeout: 10000 });
  });

  test('should support regenerate', async ({ page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('German');
    const regenerate = answer.getByTestId('answer-regenerate');
    await regenerate.click();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('Apple');
  });

  test('should show error when request failed', async ({ page, utils }) => {
    await page.route('**/graphql', route => route.abort('failed'));
    await utils.editor.askAIWithText(page, 'Appel');
    await page.getByTestId('action-fix-spelling').click();
    await expect(page.getByTestId('ai-error')).toBeVisible();
  });

  test('should support retry when error', async ({ page, utils }) => {
    await page.route('**/graphql', route => route.abort('failed'));
    await utils.editor.askAIWithText(page, 'Appel');
    await page.getByTestId('action-fix-spelling').click();
    const aiPanelContainer = await page.getByTestId('ai-panel-container');

    await page.route('**/graphql', route => route.continue());
    await utils.api.mockApis();
    await aiPanelContainer.getByTestId('error-retry').click();
    const answer = await utils.editor.waitForAiAnswer(page);
    await expect(answer).toHaveText(/Apple/, { timeout: 10000 });
  });

  test('should support discard', async ({ page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('German');
    const discard = answer.getByTestId('answer-discard');
    await discard.click();
    await expect(answer).not.toBeVisible();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('Apple');
  });

  test('should support discard when click outside', async ({ page, utils }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('German');
    await page.mouse.click(0, 0);
    await expect(page.getByText('Discard the AI result')).toBeVisible();
    await page.getByTestId('confirm-modal-confirm').click();
    await expect(answer).not.toBeVisible();
    const content = await utils.editor.getEditorContent(page);
    expect(content).toBe('Apple');
  });

  test('should focus on textarea', async ({ page, utils }) => {
    await utils.editor.askAIWithText(page, 'Apple');

    const textarea = await utils.editor.whatAreYourThoughts(page, 'Coffee');

    await expect(textarea).toBeFocused();

    const value = await textarea.inputValue();
    expect(value).toBe('Coffee');
  });
});
