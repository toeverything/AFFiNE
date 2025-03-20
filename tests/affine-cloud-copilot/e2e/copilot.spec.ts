import { test } from '@affine-test/kit/playwright';
import {
  createRandomAIUser,
  loginUser,
  loginUserDirectly,
} from '@affine-test/kit/utils/cloud';
import { focusDocTitle, getPageMode } from '@affine-test/kit/utils/editor';
import { openHomePage, setCoreUrl } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });

const ONE_SECOND = 1000;
const TEN_SECONDS = 10 * ONE_SECOND;
const ONE_MINUTE = 60 * ONE_SECOND;

let isProduction = process.env.NODE_ENV === 'production';
if (
  process.env.PLAYWRIGHT_USER_AGENT &&
  process.env.PLAYWRIGHT_EMAIL &&
  !process.env.PLAYWRIGHT_PASSWORD
) {
  test.use({
    userAgent: process.env.PLAYWRIGHT_USER_AGENT || 'affine-tester',
  });
  setCoreUrl(process.env.PLAYWRIGHT_CORE_URL || 'http://localhost:8080');
  isProduction = true;
}

function getUser() {
  if (
    !isProduction ||
    !process.env.PLAYWRIGHT_EMAIL ||
    !process.env.PLAYWRIGHT_PASSWORD
  ) {
    return createRandomAIUser();
  }

  return {
    email: process.env.PLAYWRIGHT_EMAIL,
    password: process.env.PLAYWRIGHT_PASSWORD,
  };
}

const isCopilotConfigured =
  !!process.env.COPILOT_OPENAI_API_KEY &&
  !!process.env.COPILOT_FAL_API_KEY &&
  !!process.env.COPILOT_PERPLEXITY_API_KEY &&
  process.env.COPILOT_OPENAI_API_KEY !== '1' &&
  process.env.COPILOT_FAL_API_KEY !== '1' &&
  process.env.COPILOT_PERPLEXITY_API_KEY !== '1';

test.skip(() => !isCopilotConfigured, 'skip test if no copilot api key');

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

const openChat = async (page: Page) => {
  if (await page.getByTestId('sidebar-tab-chat').isHidden()) {
    await page.getByTestId('right-sidebar-toggle').click({
      delay: 200,
    });
  }
  await page.getByTestId('sidebar-tab-chat').click();
};

const typeChat = async (page: Page, content: string) => {
  await page.getByTestId('chat-panel-input').focus();
  await page.keyboard.type(content);
};

const typeChatSequentially = async (page: Page, content: string) => {
  const input = await page.locator('chat-panel-input textarea').nth(0);
  await input.pressSequentially(content, {
    delay: 50,
  });
};

const makeChat = async (page: Page, content: string) => {
  await openChat(page);
  await typeChat(page, content);
  await page.keyboard.press('Enter');
};

const clearChat = async (page: Page) => {
  await page.getByTestId('chat-panel-clear').click();
  await page.getByTestId('confirm-modal-confirm').click();
  await page.waitForTimeout(500);
};

const collectHistory = async (page: Page) => {
  const chatPanel = await page.waitForSelector('.chat-panel-messages');
  return Promise.all(
    Array.from(
      await chatPanel.$$(
        'chat-message-user,chat-message-assistant,chat-message-action'
      )
    ).map(async m => {
      const isAssistant = await m.evaluate(
        el => el.tagName.toLocaleLowerCase() === 'chat-message-assistant'
      );
      const isChatAction = await m.evaluate(
        el => el.tagName.toLocaleLowerCase() === 'chat-message-action'
      );

      return isAssistant || isChatAction
        ? {
            name: await m.$('.user-info').then(i => i?.innerText()),
            content: await m
              .$('chat-content-rich-text')
              .then(t => t?.$('editor-host'))
              .then(e => e?.innerText()),
          }
        : {
            name: 'You',
            content: await m
              .$('chat-content-pure-text')
              .then(i => i?.innerText()),
          };
    })
  );
};

const collectChat = async (page: Page) => {
  await page.waitForTimeout(ONE_SECOND);
  const chatPanel = await page.waitForSelector('.chat-panel-messages');
  if (await chatPanel.$('.messages-placeholder')) {
    return [];
  }
  // wait ai response
  await page.waitForSelector(
    '.chat-panel-messages chat-message-assistant chat-copy-more',
    {
      timeout: ONE_MINUTE,
    }
  );
  await page.waitForTimeout(200);
  await page
    .locator('.chat-panel-messages > chat-message-assistant')
    .last()
    .locator('chat-copy-more');
  await page.waitForTimeout(200);
  return collectHistory(page);
};

const focusToEditor = async (page: Page) => {
  const title = getBlockSuiteEditorTitle(page);
  await title.focus();
  await page.keyboard.press('Enter');
};

const getEditorContent = async (page: Page) => {
  let content = '';
  let retry = 3;
  while (!content && retry > 0) {
    const lines = await page.$$('page-editor .inline-editor');
    const contents = await Promise.all(lines.map(el => el.innerText()));
    content = contents
      // cleanup zero width space
      .map(c => c.replace(/\u200B/g, '').trim())
      .filter(c => !!c)
      .join('\n');
    if (!content) {
      await page.waitForTimeout(500);
      retry -= 1;
    }
  }
  return content;
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
  const loginButton = await page.getByTestId('ai-error-action-button');
  expect(await loginButton.innerText()).toBe('Login');
});

test('can chat after login at chat side panel', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await makeChat(page, 'hello');
  const loginButton = await page.getByTestId('ai-error-action-button');
  await loginButton.click();
  // login
  const user = await getUser();
  await loginUserDirectly(page, user);
  // after login
  await makeChat(page, 'hello');
  const history = await collectChat(page);
  expect(history[0]).toEqual({ name: 'You', content: 'hello' });
  expect(history[1].name).toBe('AFFiNE AI');
});

test.describe('chat panel', () => {
  let user: {
    email: string;
    password: string;
  };

  test.beforeEach(async ({ page }) => {
    user = await getUser();
    await loginUser(page, user);
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

  test('chat send button', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    const sendButton = await page.getByTestId('chat-panel-send');
    await openChat(page);
    // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
    expect(await sendButton.getAttribute('aria-disabled')).toBe('true');
    await typeChat(page, 'hello');
    // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
    expect(await sendButton.getAttribute('aria-disabled')).toBe('false');
    await sendButton.click();
    // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
    expect(await sendButton.getAttribute('aria-disabled')).toBe('true');

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
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      content
    );
    await page.getByTestId('action-retry-button').click();
    expect((await collectChat(page))[1].content).not.toBe(content);
  });

  test('can be inserted below the current selected block', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);

    // create tow blocks
    await focusToEditor(page);
    await page.keyboard.type('hello');
    await page.keyboard.press('Enter');
    await page.keyboard.type('world');

    // focus to hello
    await page.waitForSelector('affine-paragraph');
    const paragraphs = await page.$$('affine-paragraph');
    await paragraphs[0].click();

    await makeChat(page, 'hello');
    const content = (await collectChat(page))[1].content;
    await paragraphs[0].click();

    await page.getByTestId('action-insert').click();

    const editorContent = await getEditorContent(page);
    expect(editorContent).toBe(`hello\n${content}\nworld`);
  });

  test('can be inserted below the last block if nothing selected', async ({
    page,
  }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);

    // create tow blocks
    await focusToEditor(page);
    await page.keyboard.type('hello');
    await page.keyboard.press('Enter');
    await page.keyboard.type('world');

    // focus to hello
    await page.waitForSelector('affine-paragraph');

    await makeChat(page, 'hello');
    const content = (await collectChat(page))[1].content;

    await focusDocTitle(page);

    await page.getByTestId('action-insert').click();

    const editorContent = await getEditorContent(page);
    expect(editorContent).toBe(`hello\nworld\n${content}`);
  });

  test('can be inserted as a new note if no note selected in edgeless mode', async ({
    page,
  }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await switchToEdgelessMode(page);

    // delete default note
    await (await page.waitForSelector('affine-edgeless-note')).click();
    page.keyboard.press('Delete');

    // insert as a new note
    await makeChat(page, 'hello');
    const content = (await collectChat(page))[1].content;
    await page.getByTestId('action-insert').click();

    const edgelessNode = await page.waitForSelector('affine-edgeless-note');
    expect(await edgelessNode.innerText()).toBe(content);
  });

  test('can be inserted into selected note in edgeless mode', async ({
    page,
  }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await switchToEdgelessMode(page);

    // select
    const note = await page.waitForSelector('affine-edgeless-note');
    await note.click();

    // insert as a new note
    await makeChat(page, 'hello');
    const content = (await collectChat(page))[1].content;
    await page.getByTestId('action-insert').click();

    expect(await note.innerText()).toContain(content);
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
    await page.getByTestId('action-save-as-doc').click();
    // wait for new editor
    editor.waitForElementState('hidden');
    await page.waitForSelector('page-editor');
    const editorContent = await getEditorContent(page);
    expect(editorContent).toBe(content);
  });

  test.describe('chat block', () => {
    const collectNewMessages = async (page: Page) => {
      // wait ai response
      const newMessagesContainer = await page.waitForSelector(
        '.new-chat-messages-container'
      );
      await page.waitForSelector(
        '.new-chat-messages-container .assistant-message-container chat-copy-more'
      );
      const lastMessage = await newMessagesContainer
        .$$('.assistant-message-container')
        .then(m => m[m.length - 1]);
      await lastMessage.waitForSelector('chat-copy-more');
      await page.waitForTimeout(ONE_SECOND);
      return Promise.all(
        Array.from(await newMessagesContainer.$$('.ai-chat-message')).map(
          async m => ({
            name: await m.$('.user-name').then(i => i?.innerText()),
            content: await m
              .$('.ai-answer-text-editor')
              .then(t => t?.$('editor-host'))
              .then(e => e?.innerText()),
          })
        )
      );
    };

    // make chat before each test
    test.beforeEach(async ({ page }) => {
      await page.reload();
      await clickSideBarAllPageButton(page);
      await page.waitForTimeout(200);
      await createLocalWorkspace({ name: 'test' }, page);
      await clickNewPageButton(page);
      await makeChat(page, 'hello');
    });

    test('can be save chat to block when page mode', async ({ page }) => {
      const contents = (await collectChat(page)).map(m => m.content);
      expect(await getPageMode(page)).toBe('page');
      await page.getByTestId('action-save-as-block').click();
      const chatBlock = await page.waitForSelector('affine-edgeless-ai-chat');
      // should switch to edgeless mode
      expect(await getPageMode(page)).toBe('edgeless');
      expect(
        await Promise.all(
          (await chatBlock.$$('.ai-chat-message .ai-answer-text-editor')).map(
            m => m.innerText()
          )
        )
      ).toStrictEqual(contents);
    });

    test('can be save chat to block when edgeless mode', async ({ page }) => {
      const contents = (await collectChat(page)).map(m => m.content);
      await switchToEdgelessMode(page);
      expect(await getPageMode(page)).toBe('edgeless');
      await page.getByTestId('action-save-as-block').click();
      const chatBlock = await page.waitForSelector('affine-edgeless-ai-chat');
      expect(
        await Promise.all(
          (await chatBlock.$$('.ai-chat-message .ai-answer-text-editor')).map(
            m => m.innerText()
          )
        )
      ).toStrictEqual(contents);
    });

    test('can save chat to block and clear history', async ({ page }) => {
      await collectChat(page);
      expect(await getPageMode(page)).toBe('page');
      await page.getByTestId('action-save-as-block').click();
      await page.waitForSelector('affine-edgeless-ai-chat');

      await page.reload();
      await page.waitForTimeout(200);
      await clearChat(page);
      expect((await collectChat(page)).length).toBe(0);
    });

    test('chat in center peek', async ({ page }) => {
      const contents = (await collectChat(page)).map(m => m.content);
      await page.getByTestId('action-save-as-block').click();
      const chatBlock = await page.waitForSelector('affine-edgeless-ai-chat');
      // open chat in center peek
      await chatBlock.dblclick();
      const chatBlockPeekView = await page.waitForSelector(
        'ai-chat-block-peek-view'
      );
      expect(await chatBlockPeekView.isVisible()).toBe(true);
      expect(
        await Promise.all(
          (
            await chatBlockPeekView.$$(
              '.ai-chat-message .ai-answer-text-editor'
            )
          ).map(m => m.innerText())
        )
      ).toStrictEqual(contents);

      // chat in center peek
      await page.getByTestId('chat-block-input').focus();
      await page.keyboard.type('hi');
      await page.keyboard.press('Enter');

      // collect new messages
      const newMessages = await collectNewMessages(page);
      expect(newMessages[0].content).toEqual('hi');
      expect(newMessages[1].name).toBe('AFFiNE AI');
      expect(newMessages[1].content?.length).toBeGreaterThan(0);

      // close peek view
      await page.getByTestId('peek-view-control').click();
      await page.waitForSelector('ai-chat-block-peek-view', {
        state: 'hidden',
      });

      // there should be two chat block
      const chatBlocks = await page.$$('affine-edgeless-ai-chat');
      expect(chatBlocks.length).toBe(2);
    });
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

  test('can regenerate chat in page mode', async ({ page }) => {
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
  });

  test('can discard chat in page mode', async ({ page }) => {
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

    // discard without confirm modal
    {
      const resp = await page.waitForSelector(
        'ai-panel-answer .response-list-container:last-child'
      );
      await (await resp.waitForSelector('.ai-item-discard')).click();
      const editorContent = await getEditorContent(page);
      expect(editorContent).toBe('');
    }
  });

  test('can discard chat with confirm modal in edgeless mode', async ({
    page,
  }) => {
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

    // discard with confirm modal
    {
      await page.waitForSelector(
        'ai-panel-answer .response-list-container:last-child'
      );
      await page.mouse.click(100, 100);
      await page.getByTestId('confirm-modal-confirm').click();
      const editorContent = await getEditorContent(page);
      expect(editorContent).toBe('');
    }
  });

  test('can open and close network search', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);

    await openChat(page);
    await page.getByTestId('chat-network-search').click();
    await typeChatSequentially(page, 'What is the weather in Shanghai today?');
    await page.keyboard.press('Enter');
    let history = await collectChat(page);
    expect(history[0]).toEqual({
      name: 'You',
      content: 'What is the weather in Shanghai today?',
    });
    expect(history[1].name).toBe('AFFiNE AI');
    expect(
      await page.locator('chat-panel affine-footnote-node').count()
    ).toBeGreaterThan(0);

    await clearChat(page);
    expect((await collectChat(page)).length).toBe(0);
    await page.getByTestId('chat-network-search').click();
    await typeChatSequentially(page, 'What is the weather in Shanghai today?');
    await page.keyboard.press('Enter');
    history = await collectChat(page);
    expect(history[0]).toEqual({
      name: 'You',
      content: 'What is the weather in Shanghai today?',
    });
    expect(history[1].name).toBe('AFFiNE AI');
    expect(await page.locator('chat-panel affine-footnote-node').count()).toBe(
      0
    );
  });

  test('can identify shape color, even if network search is active', async ({
    page,
  }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);

    await openChat(page);
    await page.getByTestId('chat-network-search').click();

    await switchToEdgelessMode(page);

    const shapeButton = await page.waitForSelector(
      'edgeless-shape-tool-button'
    );
    await shapeButton.click();
    await page.mouse.click(400, 400);

    const askAIButton = await page.waitForSelector('.copilot-icon-button');
    await askAIButton.click();

    await page.waitForTimeout(1000);
    await page.keyboard.type('What color is this shape?');
    await page.keyboard.press('Enter');

    const history = await collectChat(page);
    expect(history[0]).toEqual({
      name: 'You',
      content: 'What color is this shape?',
    });
    expect(history[1].name).toBe('AFFiNE AI');
    expect(history[1].content).toContain('yellow');
    expect(await page.locator('chat-panel affine-footnote-node').count()).toBe(
      0
    );
  });

  test('can trigger inline ai input and action panel by clicking Start with AI button', async ({
    page,
  }) => {
    await clickNewPageButton(page);
    await page.getByTestId('start-with-ai-badge').click();
    await expect(page.locator('affine-ai-panel-widget')).toBeVisible();
    await expect(page.locator('ask-ai-panel')).toBeVisible();
  });
});

test.describe('chat with block', () => {
  let user: {
    email: string;
    password: string;
  };

  test.beforeEach(async ({ page }) => {
    user = await getUser();
    await loginUser(page, user);
  });

  const collectTextAnswer = async (page: Page) => {
    // wait ai response
    await page.waitForSelector(
      'affine-ai-panel-widget .response-list-container',
      { timeout: 5 * ONE_MINUTE }
    );
    const answer = await page.waitForSelector(
      'affine-ai-panel-widget ai-panel-answer editor-host'
    );
    return answer.innerText();
  };

  const collectCanvasAnswer = async (page: Page, tagName: string) => {
    // wait ai response
    await page.waitForSelector(
      'affine-ai-panel-widget .response-list-container',
      { timeout: 5 * ONE_MINUTE }
    );
    const answer = await page.waitForSelector(
      `affine-ai-panel-widget ai-panel-answer ${tagName}`
    );
    return answer;
  };

  const collectImageAnswer = async (page: Page, timeout = TEN_SECONDS) => {
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

  const disableEditorBlank = async (page: Page) => {
    // hide blank element, this may block the click
    const blank = page.getByTestId('page-editor-blank');
    if (await blank.isVisible()) {
      await blank.evaluate(node => (node.style.pointerEvents = 'none'));
    } else {
      console.warn('blank element not found');
    }
  };

  test.describe('chat with text', () => {
    const pasteTextToPageEditor = async (page: Page, content: string) => {
      await focusToEditor(page);
      await page.keyboard.type(content);
    };

    test.beforeEach(async ({ page }) => {
      await page.reload();
      await clickSideBarAllPageButton(page);
      await page.waitForTimeout(200);
      await createLocalWorkspace({ name: 'test' }, page);
      await clickNewPageButton(page);
      await pasteTextToPageEditor(page, 'Mac Mini');
      await openChat(page);
    });

    test.beforeEach(async ({ page }) => {
      await page.waitForSelector('affine-paragraph').then(i => i.click());
      await page.keyboard.press('ControlOrMeta+A');
      await page
        .waitForSelector('page-editor editor-toolbar ask-ai-icon', {
          state: 'attached',
          timeout: 10000,
        })
        .then(b => b.click());
    });

    const options = [
      // review with ai
      'Fix spelling',
      'Fix Grammar',
      // edit with ai
      'Explain selection',
      'Improve writing',
      'Make it longer',
      'Make it shorter',
      'Continue writing',
      // generate with ai
      'Summarize',
      'Generate headings',
      'Generate outline',
      'Find actions',
      'Generate an image',
      'Brainstorm ideas with mind map',
      'Generate presentation',
      'Make it real',
      // draft with ai
      'Write an article about this',
      'Write a tweet about this',
      'Write a poem about this',
      'Write a blog post about this',
      'Brainstorm ideas about this',
    ];
    for (const option of options) {
      test(option, async ({ page }) => {
        await disableEditorBlank(page);
        await page
          .waitForSelector(
            `.ai-item-${option.replaceAll(' ', '-').toLowerCase()}`
          )
          .then(i => i.click());

        if (option === 'Generate an image') {
          const mindmap = await collectCanvasAnswer(page, '.ai-answer-image');
          expect(mindmap).toBeTruthy();
        } else if (option === 'Brainstorm ideas with mind map') {
          const mindmap = await collectCanvasAnswer(
            page,
            'mini-mindmap-preview'
          );
          expect(mindmap).toBeTruthy();
        } else if (option === 'Generate presentation') {
          const presentation = await collectCanvasAnswer(
            page,
            'ai-slides-renderer'
          );
          expect(presentation).toBeTruthy();
        } else if (option === 'Make it real') {
          const makeItReal = await collectCanvasAnswer(
            page,
            '.ai-answer-iframe'
          );
          expect(makeItReal).toBeTruthy();
        } else {
          expect(await collectTextAnswer(page)).toBeTruthy();
        }
        // TODO some actions do not have history yet
        if (
          option !== 'Generate presentation' &&
          option !== 'Brainstorm ideas with mind map'
        ) {
          const history = await collectHistory(page);
          expect(history.length).toBe(1);
          expect(history[0].name).toBe('AFFiNE AI');
          const discard = await page.waitForSelector('.ai-item-discard');
          await discard.click();
          await clearChat(page);
          expect((await collectHistory(page)).length).toBe(0);
        }
      });
    }

    test.describe('Translate to', () => {
      test('should close all ai item list when clicking outside', async ({
        page,
      }) => {
        const item = await page.waitForSelector('.ai-item-translate-to');
        await item.hover();

        const subItemList = await page.waitForSelector('ai-sub-item-list');

        const bounds = await subItemList.boundingBox();
        expect(bounds).toBeTruthy();

        await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y - 20);

        await expect(page.locator('ai-sub-item-list')).toBeHidden();
        await expect(page.locator('ai-item-list')).toBeHidden();
      });

      test('should close all ai item list when clicking sub item', async ({
        page,
      }) => {
        const item = await page.waitForSelector(
          'ask-ai-panel .ai-item-translate-to'
        );
        await item.hover();

        const subItemList = await page.waitForSelector('ai-sub-item-list');

        const bounds = await subItemList.boundingBox();
        expect(bounds).toBeTruthy();

        (await subItemList.waitForSelector('.menu-item:nth-child(1)')).click();

        await expect(page.locator('ai-sub-item-list')).toBeHidden();
        await expect(page.locator('ask-ai-panel ai-item-list')).toBeHidden();
      });
    });
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

    test.describe('page mode', () => {
      test.beforeEach(async ({ page }) => {
        await disableEditorBlank(page);
        await page.waitForSelector('affine-image').then(i => i.click());
        await page
          .waitForSelector('affine-image editor-toolbar ask-ai-icon')
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
          .waitForSelector('chat-panel-input image-preview-grid')
          .then(el => el.waitForElementState('visible'));
      });
    });

    // TODO(@darkskygit): block by BS-1709, enable this after bug fix
    test.describe.skip('edgeless mode', () => {
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

        await disableEditorBlank(page);
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

      const processes = [
        'Clearer',
        'Remove background',
        // skip by default, need a face in image
        // 'Convert to sticker',
      ];
      for (const process of processes) {
        test(`image processing ${process}`, async ({ page }) => {
          await page
            .waitForSelector('.ai-item-image-processing')
            .then(i => i.hover());
          await page.getByText(process).click();
          {
            // to be remove
            await page.keyboard.type(',');
            await page.keyboard.press('Enter');
          }
          expect(await collectImageAnswer(page, ONE_MINUTE * 2)).toBeTruthy();
        });
      }

      const filters = ['Clay', 'Sketch', 'Anime', 'Pixel'];
      for (const filter of filters) {
        test(`ai image ${filter.toLowerCase()} filter`, async ({ page }) => {
          await page
            .waitForSelector('.ai-item-ai-image-filter')
            .then(i => i.hover());
          await page.getByText(`${filter} style`).click();
          {
            // to be remove
            await page.keyboard.type(',');
            await page.keyboard.press('Enter');
          }
          expect(await collectImageAnswer(page, ONE_MINUTE * 2)).toBeTruthy();
        });
      }
    });
  });

  test('clear history', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);
    await focusToEditor(page);
    await page.keyboard.type('Mac Mini');
    await openChat(page);

    await makeChat(page, 'hello');
    await collectHistory(page);

    await page.waitForSelector('affine-paragraph').then(i => i.click());
    await page.keyboard.press('ControlOrMeta+A');
    await page
      .waitForSelector('page-editor editor-toolbar ask-ai-icon', {
        state: 'attached',
        timeout: 10000,
      })
      .then(b => b.click());
    await disableEditorBlank(page);
    await page
      .waitForSelector(
        `.ai-item-${`Fix spelling`.replaceAll(' ', '-').toLowerCase()}`
      )
      .then(i => i.click());
    await collectTextAnswer(page);

    await page.reload();
    await page.waitForTimeout(1000);
    const history = await collectHistory(page);
    expect(history.length).toBe(3);
    await clearChat(page);
    expect((await collectHistory(page)).length).toBe(0);
  });
});

test.describe('chat with doc', () => {
  let user: {
    email: string;
    password: string;
  };

  test.beforeEach(async ({ page }) => {
    user = await getUser();
    await loginUser(page, user);
  });

  test('can chat with current doc', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
    await clickNewPageButton(page);

    await openChat(page);

    const addButton = await page.locator('chat-panel-chips .add-button');
    await addButton.click();
    const docItem = await page.locator('chat-panel-add-popover icon-button', {
      hasText: 'Untitled',
    });
    await docItem.click();
    await page.waitForTimeout(200);
    let chipTitle = await page.getByTestId('chat-panel-chip-title');
    expect(await chipTitle.textContent()).toBe('Untitled');
    let chip = await page.getByTestId('chat-panel-chip');
    // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
    expect(await chip.getAttribute('data-state')).toBe('finished');

    const editorTitle = await page.locator('doc-title .inline-editor').nth(0);
    await editorTitle.pressSequentially('AFFiNE AI', {
      delay: 50,
    });
    await page.keyboard.press('Enter', { delay: 50 });
    // Wait for the editor to be ready and focused
    await page.waitForSelector('page-editor affine-paragraph .inline-editor');
    const richText = await page
      .locator('page-editor affine-paragraph .inline-editor')
      .nth(0);
    await richText.click(); // Ensure proper focus
    await page.keyboard.type(
      'AFiAI is an assistant with the ability to create well-structured outlines for any given content.',
      {
        delay: 50,
      }
    );

    expect(await chipTitle.textContent()).toBe('AFFiNE AI');
    // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
    expect(await chip.getAttribute('data-state')).toBe('finished');

    await typeChatSequentially(page, 'What is AFiAI?');
    await page.keyboard.press('Enter');
    const history = await collectChat(page);
    expect(history[0]).toEqual({
      name: 'You',
      content: 'What is AFiAI?',
    });

    expect(history[1].name).toBe(`AFFiNE AI\nwith your docs`);
    expect(
      await page.locator('chat-panel affine-footnote-node').count()
    ).toBeGreaterThan(0);
    await clearChat(page);
    expect((await collectChat(page)).length).toBe(0);

    await page.reload();
    await page.waitForTimeout(200);
    await openChat(page);
    expect(await chipTitle.textContent()).toBe('AFFiNE AI');
    const chip2 = await page.getByTestId('chat-panel-chip');
    // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
    expect(await chip2.getAttribute('data-state')).toBe('finished');
  });
});
