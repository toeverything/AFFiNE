import { test } from '@affine-test/kit/playwright';
import {
  createRandomAIUser,
  loginUser,
  loginUserDirectly,
} from '@affine-test/kit/utils/cloud';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect, type Page } from '@playwright/test';

test.skip(
  () => !process.env.COPILOT_OPENAI_API_KEY || !process.env.COPILOT_FAL_API_KEY,
  'skip test if no copilot api key'
);

test('can open chat side panel', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await page.getByTestId('right-sidebar-toggle').click({
    delay: 200,
  });
  await page.getByTestId('sidebar-tab-chat').click();
  await expect(page.getByTestId('sidebar-tab-content-chat')).toBeVisible();
});

const makeChat = async (page: Page, content: string) => {
  if (await page.getByTestId('sidebar-tab-chat').isHidden()) {
    await page.getByTestId('right-sidebar-toggle').click({
      delay: 200,
    });
  }
  await page.getByTestId('sidebar-tab-chat').click();
  await page.getByTestId('chat-panel-input').focus();
  await page.keyboard.type(content);
  await page.keyboard.press('Enter');
};

const clearChat = async (page: Page) => {
  await page.getByTestId('chat-panel-clear').click();
  await page.getByTestId('confirm-modal-confirm').click();
};

const collectChat = async (page: Page) => {
  const chatPanel = await page.waitForSelector('.chat-panel-messages');
  // wait ai response
  const lastMessage = await chatPanel.$$('.message').then(m => m[m.length - 1]);
  await lastMessage.waitForSelector('chat-copy-more');
  await page.waitForTimeout(500);
  return Promise.all(
    Array.from(await chatPanel.$$('.message')).map(async m => ({
      name: await m.$('.user-info').then(i => i?.innerText()),
      content: await m
        .$('ai-answer-text')
        .then(t => t?.$('editor-host'))
        .then(e => e?.innerText()),
    }))
  );
};

const focusToEditor = async (page: Page) => {
  const title = getBlockSuiteEditorTitle(page);
  await title.focus();
  await page.keyboard.press('Enter');
};

const getEditorContent = async (page: Page) => {
  const lines = await page.$$('page-editor .inline-editor');
  const contents = await Promise.all(lines.map(el => el.innerText()));
  return (
    contents
      // cleanup zero width space
      .map(c => c.replace(/\u200B/g, '').trim())
      .filter(c => !!c)
      .join('\n')
  );
};

const switchToEdgelessMode = async (page: Page) => {
  const editor = await page.waitForSelector('page-editor');
  await page.getByTestId('switch-edgeless-mode-button').click();
  // wait for new editor
  editor.waitForElementState('hidden');
  await page.waitForSelector('edgeless-editor');
};

test('can trigger login at chat side panel', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await makeChat(page, 'hello');
  const loginTips = await page.waitForSelector('ai-error-wrapper');
  expect(await loginTips.innerText()).toBe('Login');
});

test('can chat after login at chat side panel', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await makeChat(page, 'hello');
  const loginTips = await page.waitForSelector('ai-error-wrapper');
  (await loginTips.$('div'))!.click();
  // login
  const user = await createRandomAIUser();
  await loginUserDirectly(page, user.email);
  // after login
  await makeChat(page, 'hello');
  const history = await collectChat(page);
  expect(history[0]).toEqual({ name: 'You', content: 'hello' });
  expect(history[1].name).toBe('AFFiNE AI');
});

test.describe('chat panel', () => {
  let user: {
    id: string;
    name: string;
    email: string;
    password: string;
  };

  test.beforeEach(async ({ page }) => {
    user = await createRandomAIUser();
    await loginUser(page, user.email);
  });

  test('basic chat', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await makeChat(page, 'hello');
    const history = await collectChat(page);
    expect(history[0]).toEqual({ name: 'You', content: 'hello' });
    expect(history[1].name).toBe('AFFiNE AI');
    await clearChat(page);
    expect((await collectChat(page)).length).toBe(0);
  });

  test('chat actions', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await makeChat(page, 'hello');
    const content = (await collectChat(page))[1].content;
    await page.getByTestId('action-copy-button').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      content
    );
    await page.getByTestId('action-retry-button').click();
    expect((await collectChat(page))[1].content).not.toBe(content);
  });

  test('can be insert below', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await makeChat(page, 'hello');
    const content = (await collectChat(page))[1].content;
    await focusToEditor(page);
    // insert below
    await page.getByTestId('action-insert-below').click();
    const editorContent = await getEditorContent(page);
    expect(editorContent).toBe(content);
  });

  test('can be add to edgeless as node', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await makeChat(page, 'hello');
    const content = (await collectChat(page))[1].content;
    await switchToEdgelessMode(page);
    // delete default note
    await (await page.waitForSelector('affine-edgeless-note')).click();
    page.keyboard.press('Delete');
    // insert note
    await page.getByTestId('action-add-to-edgeless-as-note').click();
    const edgelessNode = await page.waitForSelector('affine-edgeless-note');
    expect(await edgelessNode.innerText()).toBe(content);
  });

  test('can be create as a doc', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await makeChat(page, 'hello');
    const content = (await collectChat(page))[1].content;
    const editor = await page.waitForSelector('page-editor');
    await page.getByTestId('action-create-as-a-doc').click();
    // wait for new editor
    editor.waitForElementState('hidden');
    await page.waitForSelector('page-editor');
    const editorContent = await getEditorContent(page);
    expect(editorContent).toBe(content);
  });

  // feature not launched yet
  test.skip('can be save chat to block', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await makeChat(page, 'hello');
    const contents = (await collectChat(page)).map(m => m.content);
    await switchToEdgelessMode(page);
    await page.getByTestId('action-save-chat-to-block').click();
    const chatBlock = await page.waitForSelector('affine-edgeless-ai-chat');
    expect(
      await Promise.all(
        (await chatBlock.$$('.ai-chat-user-message')).map(m => m.innerText())
      )
    ).toBe(contents);
  });

  test('can be chat and insert below in page mode', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await focusToEditor(page);
    await page.keyboard.type('/');
    await page.getByTestId('sub-menu-0').getByText('Ask AI').click();
    const input = await page.waitForSelector('ai-panel-input textarea');
    await input.fill('hello');
    await input.press('Enter');
    const resp = await page.waitForSelector(
      'ai-panel-answer .response-list-container'
    ); // wait response
    const content = await (
      await page.waitForSelector('ai-panel-answer editor-host')
    ).innerText();
    await (await resp.waitForSelector('.ai-item-insert-below')).click();
    const editorContent = await getEditorContent(page);
    expect(editorContent).toBe(content);
  });

  test('can be retry or discard chat in page mode', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await focusToEditor(page);
    await page.keyboard.type('/');
    await page.getByTestId('sub-menu-0').getByText('Ask AI').click();
    const input = await page.waitForSelector('ai-panel-input textarea');
    await input.fill('hello');
    await input.press('Enter');
    // regenerate
    {
      const resp = await page.waitForSelector(
        'ai-panel-answer .response-list-container:last-child'
      );
      const answerEditor = await page.waitForSelector(
        'ai-panel-answer editor-host'
      );
      const content = await answerEditor.innerText();
      await (await resp.waitForSelector('.ai-item-regenerate')).click();
      await page.waitForSelector('ai-panel-answer .response-list-container'); // wait response
      expect(
        await (
          await (
            await page.waitForSelector('ai-panel-answer')
          ).waitForSelector('editor-host')
        ).innerText()
      ).not.toBe(content);
    }

    // discard
    {
      const resp = await page.waitForSelector(
        'ai-panel-answer .response-list-container:last-child'
      );
      await (await resp.waitForSelector('.ai-item-discard')).click();
      await page.getByTestId('confirm-modal-confirm').click();
      const editorContent = await getEditorContent(page);
      expect(editorContent).toBe('');
    }
  });
});

test.describe('chat with block', () => {
  let user: {
    id: string;
    name: string;
    email: string;
    password: string;
  };

  test.beforeEach(async ({ page }) => {
    user = await createRandomAIUser();
    await loginUser(page, user.email);
  });

  test.describe('chat with image block', () => {
    const pasteImageToPageEditor = async (page: Page) => {
      await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const blob = await new Promise<Blob>(resolve =>
          canvas.toBlob(blob => resolve(blob!), 'image/png')
        );
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
      });
      await focusToEditor(page);
      await page.keyboard.press('ControlOrMeta+V');
    };

    test.beforeEach(async ({ page }) => {
      await page.reload();
      await clickSideBarAllPageButton(page);
      await page.waitForTimeout(200);
      await createLocalWorkspace({ name: 'test' }, page);
      await clickNewPageButton(page);
      await pasteImageToPageEditor(page);
    });

    const collectTextAnswer = async (page: Page) => {
      // wait ai response
      await page.waitForSelector(
        'affine-ai-panel-widget .response-list-container'
      );
      const answer = await page.waitForSelector(
        'affine-ai-panel-widget ai-answer-text editor-host'
      );
      return answer.innerText();
    };

    const collectImageAnswer = async (page: Page, timeout = 1000 * 10) => {
      // wait ai response
      await page.waitForSelector(
        'affine-ai-panel-widget .response-list-container',
        { timeout }
      );
      const answer = await page.waitForSelector(
        'affine-ai-panel-widget .ai-answer-image img'
      );
      return answer.getAttribute('src');
    };

    test.describe('page mode', () => {
      test.beforeEach(async ({ page }) => {
        await page.waitForSelector('affine-image').then(i => i.click());
        await page
          .waitForSelector('affine-image editor-toolbar ask-ai-button')
          .then(b => b.click());
      });

      test('explain this image', async ({ page }) => {
        await page
          .waitForSelector('.ai-item-explain-this-image')
          .then(i => i.click());
        expect(await collectTextAnswer(page)).toBeTruthy();
      });

      test('generate a caption', async ({ page }) => {
        await page
          .waitForSelector('.ai-item-generate-a-caption')
          .then(i => i.click());
        expect(await collectTextAnswer(page)).toBeTruthy();
      });

      test('continue with ai', async ({ page }) => {
        await page
          .waitForSelector('.ai-item-continue-with-ai')
          .then(i => i.click());
        await page
          .waitForSelector('chat-panel-input .chat-panel-images')
          .then(el => el.waitForElementState('visible'));
      });

      test('open ai chat', async ({ page }) => {
        await page
          .waitForSelector('.ai-item-open-ai-chat')
          .then(i => i.click());
        const cards = await page.waitForSelector('chat-panel chat-cards');
        await cards.waitForElementState('visible');
        const cardTitles = await Promise.all(
          await cards
            .$$('.card-wrapper .card-title')
            .then(els => els.map(async el => await el.innerText()))
        );
        expect(cardTitles).toContain('Start with this Image');
      });
    });

    test.describe('edgeless mode', () => {
      test.beforeEach(async ({ page }) => {
        await switchToEdgelessMode(page);
        const note = await page.waitForSelector('affine-edgeless-note');

        {
          // move note to avoid menu overlap
          const box = (await note.boundingBox())!;
          page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          page.mouse.down();
          // sleep to avoid flicker
          await page.waitForTimeout(500);
          page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 200);
          await page.waitForTimeout(500);
          page.mouse.up();
          note.click();
        }

        await page.waitForSelector('affine-image').then(i => i.click());
        await page
          .waitForSelector('affine-image editor-toolbar ask-ai-button')
          .then(b => b.click());
      });

      // skip by default, dalle is very slow
      test.skip('generate an image', async ({ page }) => {
        await page
          .waitForSelector('.ai-item-generate-an-image')
          .then(i => i.click());
        await page.keyboard.type('a cat');
        await page.keyboard.press('Enter');
        expect(await collectImageAnswer(page)).toBeTruthy();
      });

      const processes = ['Clearer', 'Remove background', 'Convert to sticker'];
      for (const process of processes) {
        // skip by default, image processing depends on image content
        test.skip(`image processing ${process}`, async ({ page }) => {
          await page
            .waitForSelector('.ai-item-image-processing')
            .then(i => i.hover());
          await page.getByText(`${process} style`).click();
          {
            // to be remove
            await page.keyboard.type('test');
            await page.keyboard.press('Enter');
          }

          expect(await collectImageAnswer(page)).toBeTruthy();
        });
      }

      const filters = ['Clay', 'Sketch', 'Anime', 'Pixel'];
      for (const filter of filters) {
        // skip by default, image generate is very slow
        test.skip(`ai image ${filter.toLowerCase()} filter`, async ({
          page,
        }) => {
          await page
            .waitForSelector('.ai-item-ai-image-filter')
            .then(i => i.hover());
          await page.getByText(`${filter} style`).click();
          {
            // to be remove
            await page.keyboard.type('test');
            await page.keyboard.press('Enter');
          }
          expect(await collectImageAnswer(page, 1000 * 60)).toBeTruthy();
        });
      }
    });
  });
});
