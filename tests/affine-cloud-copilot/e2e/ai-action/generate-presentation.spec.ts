import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/GeneratePresentation', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should generate a presentation for the selected content', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { generatePresentation } = await utils.editor.askAIWithText(
      page,
      'AFFiNE is a workspace with fully merged docs'
    );
    const { answer, responses } = await generatePresentation();
    await expect(answer.locator('ai-slides-renderer')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should generate a presentation for the selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { generatePresentation } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(
          page,
          'AFFiNE is a workspace with fully merged docs'
        );
      }
    );
    const { answer, responses } = await generatePresentation();
    await expect(answer.locator('ai-slides-renderer')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should generate a presentation for the selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { generatePresentation } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(
          page,
          'AFFiNE is a workspace with fully merged docs'
        );
      }
    );
    const { answer, responses } = await generatePresentation();
    await expect(answer.locator('ai-slides-renderer')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });
});
