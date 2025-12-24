import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/GenerateAnImageWithText', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should generate an image for the selected content', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { generateImage } = await utils.editor.askAIWithText(page, 'Panda');
    const { answer, responses } = await generateImage();
    await expect(answer.getByTestId('ai-answer-image')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should generate an image for the selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { generateImage } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(page, 'Panda');
      }
    );
    const { answer, responses } = await generateImage();
    await expect(answer.getByTestId('ai-answer-image')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should generate an image for the selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { generateImage } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(page, 'Panda');
      }
    );
    const { answer, responses } = await generateImage();
    await expect(answer.getByTestId('ai-answer-image')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should generate an image for the selected shape in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { generateImage } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createShape(page, 'HelloWorld');
      }
    );
    const { answer, responses } = await generateImage();
    await expect(answer.getByTestId('ai-answer-image')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { generateImage } = await utils.editor.askAIWithText(page, 'Panda');
    const { answer } = await generateImage();
    const insert = answer.getByTestId('answer-insert-below');
    await insert.click();
    await page.waitForSelector('.affine-image-container');
    await page.reload();

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'action',
      },
    ]);

    const { answer: panelAnswer, actionName } =
      await utils.chatPanel.getLatestAIActionMessage(page);
    await expect(
      panelAnswer.getByTestId('generated-image').locator('img')
    ).toBeVisible();
    await expect(actionName).toHaveText(/image/);
  });
});
