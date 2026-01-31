// eslint-disable eslint-plugin-unicorn(prefer-dom-node-dataset
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

type ChatStatus = 'loading' | 'success' | 'error' | 'idle' | 'transmitting';

type ChatUserMessage = {
  role: 'user';
  content: string;
};

type ChatAssistantMessage = {
  role: 'assistant';
  status: ChatStatus;
  title: string;
  content: string;
};

type ChatActionMessage = {
  role: 'action';
  title: string;
  content: string;
};

type ChatMessage = ChatUserMessage | ChatAssistantMessage | ChatActionMessage;

export class ChatPanelUtils {
  public static async openChatPanel(page: Page) {
    if (await page.getByTestId('sidebar-tab-chat').isHidden()) {
      await page.getByTestId('right-sidebar-toggle').click({
        delay: 200,
      });
      await page.waitForTimeout(500); // wait the sidebar stable
    }
    await page.getByTestId('sidebar-tab-chat').click();
    await expect(page.getByTestId('sidebar-tab-content-chat')).toBeVisible();
  }

  public static async closeChatPanel(page: Page) {
    await page.getByTestId('right-sidebar-close').click({
      delay: 200,
    });
    await expect(page.getByTestId('sidebar-tab-content-chat')).toBeHidden();
  }

  public static async typeChat(page: Page, content: string) {
    await page.getByTestId('chat-panel-input').focus();
    await page.keyboard.type(content);
  }

  public static async typeChatSequentially(page: Page, content: string) {
    const input = await page.locator('chat-panel-input textarea').nth(0);
    await input.pressSequentially(content, {
      delay: 50,
    });
  }

  public static async makeChat(page: Page, content: string) {
    await this.typeChat(page, content);
    await page.keyboard.press('Enter');
  }

  public static async clearChat(page: Page) {
    await page.getByTestId('chat-panel-clear').click();
    await page.getByTestId('confirm-modal-confirm').click();
    await page.waitForTimeout(500);
  }

  public static async collectHistory(page: Page) {
    return await page.evaluate(() => {
      const chatPanel = document.querySelector<HTMLElement>(
        '[data-testid="chat-panel-messages"]'
      );
      if (!chatPanel) {
        return [] as ChatMessage[];
      }
      const messages = chatPanel.querySelectorAll<HTMLElement>(
        'chat-message-user,chat-message-assistant,chat-message-action'
      );

      return Array.from(messages).map(m => {
        const isAssistant = m.dataset.testid === 'chat-message-assistant';
        const isChatAction = m.dataset.testid === 'chat-message-action';

        const isUser = !isAssistant && !isChatAction;

        if (isUser) {
          return {
            role: 'user' as const,
            content:
              m.querySelector<HTMLElement>(
                '[data-testid="chat-content-pure-text"]'
              )?.innerText || '',
          };
        }

        if (isAssistant) {
          return {
            role: 'assistant' as const,
            status: m.dataset.status as ChatStatus,
            title: m.querySelector<HTMLElement>('.user-info')?.innerText || '',
            content:
              m.querySelector<HTMLElement>('chat-content-rich-text editor-host')
                ?.innerText || '',
          };
        }

        // Must be chat action at this point
        return {
          role: 'action' as const,
          title: m.querySelector<HTMLElement>('.user-info')?.innerText || '',
          content:
            m.querySelector<HTMLElement>('chat-content-rich-text editor-host')
              ?.innerText || '',
        };
      });
    });
  }

  private static expectHistory(
    history: ChatMessage[],
    expected: (
      | Partial<ChatUserMessage>
      | Partial<ChatAssistantMessage>
      | Partial<ChatActionMessage>
    )[]
  ) {
    expect(history).toHaveLength(expected.length);
    history.forEach((message, index) => {
      const expectedMessage = expected[index];
      expect(message).toMatchObject(expectedMessage);
    });
  }

  public static async expectToHaveHistory(
    page: Page,
    expected: (
      | Partial<ChatUserMessage>
      | Partial<ChatAssistantMessage>
      | Partial<ChatActionMessage>
    )[]
  ) {
    const history = await this.collectHistory(page);
    this.expectHistory(history, expected);
  }

  public static async waitForHistory(
    page: Page,
    expected: (
      | Partial<ChatUserMessage>
      | Partial<ChatAssistantMessage>
      | Partial<ChatActionMessage>
    )[],
    timeout = 2 * 60000
  ) {
    await expect(async () => {
      const history = await this.collectHistory(page);
      this.expectHistory(history, expected);
    }).toPass({ timeout });
  }

  public static async getLatestAssistantMessage(page: Page) {
    const message = page.getByTestId('chat-message-assistant').last();
    const actions = await message.getByTestId('chat-actions');
    const actionList = await message.getByTestId('chat-action-list');
    return {
      message,
      content: (
        await message
          .locator('chat-content-rich-text editor-host')
          .allInnerTexts()
      ).join(' '),
      actions: {
        copy: async () => actions.getByTestId('action-copy-button').click(),
        retry: async () => actions.getByTestId('action-retry-button').click(),
        insert: async () => actionList.getByTestId('action-insert').click(),
        saveAsBlock: async () =>
          actionList.getByTestId('action-save-as-block').click(),
        saveAsDoc: async () =>
          actionList.getByTestId('action-save-as-doc').click(),
        addAsNote: async () =>
          actionList.getByTestId('action-add-to-edgeless-as-note').click(),
      },
    };
  }

  public static async getLatestAIActionMessage(page: Page) {
    const message = page.getByTestId('chat-message-action').last();
    const actionName = await message.getByTestId('action-name');
    await actionName.click();
    const answer = await message.getByTestId('answer-prompt');
    const prompt = await message.getByTestId('chat-message-action-prompt');
    return {
      message,
      answer,
      prompt,
      actionName,
    };
  }

  public static async chatWithDoc(page: Page, docName: string) {
    const withButton = page.getByTestId('chat-panel-with-button');
    await withButton.hover();
    await withButton.click({ delay: 200 });
    const withMenu = page.getByTestId('ai-add-popover');
    await withMenu.waitFor({ state: 'visible' });
    await withMenu.getByText(docName).click();
    await page.getByTestId('chat-panel-chips').getByText(docName);
  }

  public static async chatWithAttachments(
    page: Page,
    attachments: { name: string; mimeType: string; buffer: Buffer }[],
    text: string
  ) {
    await page.evaluate(() => {
      delete window.showOpenFilePicker;
    });

    for (const attachment of attachments) {
      const fileChooserPromise = page.waitForEvent('filechooser');
      const withButton = page.getByTestId('chat-panel-with-button');
      await withButton.hover();
      await withButton.click({ delay: 200 });
      const withMenu = page.getByTestId('ai-add-popover');
      await withMenu.waitFor({ state: 'visible' });
      await withMenu.getByTestId('ai-chat-with-files').click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(attachment);

      await expect(async () => {
        const states = await page
          .getByTestId('chat-panel-chip')
          .evaluateAll(elements =>
            elements.map(el => el.getAttribute('data-state'))
          );

        expect(states.every(state => state === 'finished')).toBe(true);
      }).toPass({ timeout: 20000 });
    }
    await expect(async () => {
      const states = await page
        .getByTestId('chat-panel-chip')
        .evaluateAll(elements =>
          elements.map(el => el.getAttribute('data-state'))
        );
      expect(states).toHaveLength(attachments.length);
      expect(states.every(state => state === 'finished')).toBe(true);
    }).toPass({ timeout: 20000 });

    await this.makeChat(page, text);
  }

  public static async uploadImages(
    page: Page,
    images: { name: string; mimeType: string; buffer: Buffer }[]
  ) {
    await page.evaluate(() => {
      delete window.showOpenFilePicker;
    });

    const fileChooserPromise = page.waitForEvent('filechooser');
    const withButton = page.getByTestId('chat-panel-with-button');
    await withButton.hover();
    await withButton.click({ delay: 200 });
    const withMenu = page.getByTestId('ai-add-popover');
    await withMenu.waitFor({ state: 'visible' });
    await withMenu.getByTestId('ai-chat-with-images').click();

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(images);
  }

  public static async chatWithImages(
    page: Page,
    images: { name: string; mimeType: string; buffer: Buffer }[],
    text: string
  ) {
    await this.uploadImages(page, images);

    await page.waitForSelector('ai-chat-input .image-container');
    await this.makeChat(page, text);
  }

  public static async chatWithTags(page: Page, tags: string[]) {
    for (const tag of tags) {
      const withButton = page.getByTestId('chat-panel-with-button');
      await withButton.hover();
      await withButton.click({ delay: 200 });
      const withMenu = page.getByTestId('ai-add-popover');
      await withMenu.waitFor({ state: 'visible' });
      await withMenu.getByTestId('ai-chat-with-tags').click();
      await withMenu.getByText(tag).click();
      await page.getByTestId('chat-panel-chips').getByText(tag);
      await this.waitForEmbeddingProgress(page);
      await withMenu.waitFor({
        state: 'hidden',
      });
    }
  }

  public static async chatWithCollections(page: Page, collections: string[]) {
    for (const collection of collections) {
      const withButton = page.getByTestId('chat-panel-with-button');
      await withButton.hover();
      await withButton.click({ delay: 200 });
      const withMenu = page.getByTestId('ai-add-popover');
      await withMenu.waitFor({ state: 'visible' });
      await withMenu.getByTestId('ai-chat-with-collections').click();
      await withMenu.getByText(collection).click();
      await page.getByTestId('chat-panel-chips').getByText(collection);
      await this.waitForEmbeddingProgress(page);
      await withMenu.waitFor({
        state: 'hidden',
      });
    }
  }

  public static async waitForEmbeddingProgress(page: Page) {
    try {
      await page.getByTestId('chat-panel-embedding-progress').waitFor({
        state: 'visible',
      });
      await page.getByTestId('chat-panel-embedding-progress').waitFor({
        state: 'hidden',
      });
    } catch {
      // do nothing
    }
  }

  public static async openChatInputPreference(page: Page) {
    const trigger = page.getByTestId('chat-input-preference-trigger');
    await trigger.click();
    await page.getByTestId('chat-input-preference').waitFor({
      state: 'visible',
    });
  }

  public static async enableReasoning(page: Page) {
    await this.openChatInputPreference(page);
    const reasoning = page.getByTestId('chat-reasoning');
    if ((await reasoning.getAttribute('data-active')) === 'false') {
      await reasoning.click();
    }
  }

  public static async disableReasoning(page: Page) {
    await this.openChatInputPreference(page);
    const reasoning = page.getByTestId('chat-reasoning');
    if ((await reasoning.getAttribute('data-active')) === 'true') {
      await reasoning.click();
    }
  }
}
