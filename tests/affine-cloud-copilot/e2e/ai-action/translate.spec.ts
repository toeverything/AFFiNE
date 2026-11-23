import assert from 'node:assert/strict';

import { runPrisma } from '@affine-test/kit/utils/cloud';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/Translate', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  for (const withImage of [false, true]) {
    test(`should support translating the selected content${withImage ? ' with a WebP image' : ''}`, async ({
      loggedInPage: page,
      utils,
    }) => {
      await utils.editor.focusToEditor(page);
      await page.keyboard.insertText('Apple');

      if (withImage) {
        await page.evaluate(() => {
          delete window.showOpenFilePicker;
        });
        await page.keyboard.press('Enter');
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.keyboard.press('/');
        await page.keyboard.insertText('image');
        await page.locator('affine-slash-menu').getByTestId('Image').click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({
          name: 'blue.webp',
          mimeType: 'image/webp',
          buffer: Buffer.from(
            'UklGRl4AAABXRUJQVlA4WAoAAAAQAAAACwAACwAAQUxQSAoAAAABB1DAiAhERP8DVlA4IC4AAACQAQCdASoMAAwAAUAmJaACdLoAA5gA/vtV4/+lwf/S4P/pcH/pcH8bss4bpAAA',
            'base64'
          ),
        });
        const image = page.locator('page-editor affine-page-image img');
        await expect(image).toHaveJSProperty('naturalWidth', 12);
        expect(
          await image.evaluate(
            async (img: HTMLImageElement) =>
              (await (await fetch(img.src)).blob()).type
          )
        ).toBe('image/webp');
        await image.click();
      }

      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('ControlOrMeta+A');
      const { translate } = await utils.editor.showAIMenu(page);
      const streamRequest = page.waitForRequest(
        request =>
          new URL(request.url()).pathname.startsWith('/api/copilot/chat/') &&
          new URL(request.url()).pathname.endsWith('/stream-object')
      );
      const { answer, responses } = await translate('Simplified Chinese');
      const request = await streamRequest;
      if (withImage) {
        const sessionId = new URL(request.url()).pathname.split('/')[4];
        const message = await runPrisma(prisma =>
          prisma.aiSessionMessage.findFirst({
            where: { sessionId, role: 'user' },
          })
        );
        const attachments = message?.attachments;
        expect(attachments).toEqual([
          expect.objectContaining({
            kind: 'url',
            mimeType: 'image/webp',
            fileName: expect.stringMatching(/\.webp$/),
          }),
        ]);
        assert(Array.isArray(attachments));
        const attachment = attachments[0];
        assert(
          attachment &&
            typeof attachment === 'object' &&
            !Array.isArray(attachment)
        );
        assert(typeof attachment.url === 'string');
        const url = new URL(attachment.url, page.url()).toString();
        const downloaded = await page.request.get(url);
        expect(downloaded.status()).toBe(200);
        expect(downloaded.headers()['content-type']).toContain('image/webp');
        const bytes = await downloaded.body();
        expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
        expect(
          await page.evaluate(async imageUrl => {
            const blob = await (await fetch(imageUrl)).blob();
            const image = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(image.width, image.height);
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0);
            const alpha = context.getImageData(0, 0, 1, 1).data[3];
            image.close();
            return alpha;
          }, url)
        ).toBe(128);
      }
      await expect(answer).toHaveText(/苹果/, { timeout: 10000 });
      expect(responses).toEqual(new Set(['insert-below', 'replace-selection']));
    });
  }

  test('should support translating the selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { translate } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(page, 'Apple');
      }
    );
    const { answer, responses } = await translate('Simplified Chinese');
    await expect(answer).toHaveText(/苹果/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support translating the selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { translate } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(page, 'Apple');
      }
    );
    const { answer, responses } = await translate('Simplified Chinese');
    await expect(answer).toHaveText(/苹果/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { translate } = await utils.editor.askAIWithText(page, 'Apple');
    const { answer } = await translate('Simplified Chinese');
    await expect(answer).toHaveText(/苹果/, { timeout: 10000 });
    const replace = answer.getByTestId('answer-replace');
    await replace.click();
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'action',
      },
    ]);
    const {
      answer: panelAnswer,
      prompt,
      actionName,
    } = await utils.chatPanel.getLatestAIActionMessage(page);
    await expect(panelAnswer).toHaveText(/苹果/);
    await expect(prompt).toHaveText(/Translate/);
    await expect(actionName).toHaveText(/Translate/);
  });
});
