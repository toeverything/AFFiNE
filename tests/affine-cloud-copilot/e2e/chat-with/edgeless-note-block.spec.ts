import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIChatWith/EdgelessNoteBlock', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support insert a new note block below the current', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { translate } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(page, 'Apple');
      }
    );
    const { answer } = await translate('German');
    await expect(answer).toHaveText(/Apfel/, { timeout: 10000 });
    const insertBelow = answer.getByTestId('answer-insert-below');
    await insertBelow.click();
    await expect(page.locator('affine-edgeless-note').nth(1)).toHaveText(
      /Apfel/
    );
  });
});
