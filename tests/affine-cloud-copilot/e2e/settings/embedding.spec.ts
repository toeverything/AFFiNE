import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe.configure({ mode: 'serial' });

test.describe('AISettings/Embedding', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
    await utils.settings.openSettingsPanel(page);
  });

  test.afterEach(async ({ loggedInPage: page, utils }) => {
    await utils.settings.openSettingsPanel(page);
    await utils.settings.clearAllIgnoredDocs(page);
    await utils.settings.removeAllAttachments(page);
    await utils.settings.closeSettingsPanel(page);
  });

  test('should show workspace embedding enabled status', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.waitForWorkspaceEmbeddingSwitchToBe(page, true);
  });

  test('should support disable workspace embedding', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    await utils.settings.disableWorkspaceEmbedding(page);
    await utils.settings.waitForWorkspaceEmbeddingSwitchToBe(page, false);
  });

  test('should support enable workspace embedding', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.disableWorkspaceEmbedding(page);
    await utils.settings.enableWorkspaceEmbedding(page);
    await utils.settings.waitForWorkspaceEmbeddingSwitchToBe(page, true);
  });

  test('should show enable cloud panel if workspace is local', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.closeSettingsPanel(page);
    await createLocalWorkspace({ name: 'test' }, page);
    await utils.settings.openSettingsPanel(page);
    await expect(
      page.getByTestId('publish-enable-affine-cloud-button')
    ).toBeVisible();
  });

  test('should disable embedding settings if the user is not workspace owner', async ({
    loggedInPage: page,
    utils,
  }) => {
    // mock the features to be empty(without CopilotEmbedding)
    await page.route('**/graphql', async (route, request) => {
      const postData = request.postData();
      if (postData && postData.includes('serverConfig')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              serverConfig: {
                version: '1.0.0',
                baseUrl: 'http://localhost:8080',
                name: 'AFFiNE',
                features: [],
                type: 'cloud',
                initialized: true,
                credentialsRequirement: null,
              },
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.reload();
    await utils.settings.openSettingsPanel(page);

    const wrapper = await page.getByTestId(
      'workspace-embedding-setting-wrapper'
    );
    await expect(wrapper).toHaveAttribute('aria-disabled', 'true');
  });

  test('should show error message if enable workspace embedding failed', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    await utils.settings.disableWorkspaceEmbedding(page);
    await utils.settings.waitForWorkspaceEmbeddingSwitchToBe(page, false);

    await page.context().setOffline(true);
    await utils.settings.enableWorkspaceEmbedding(page, false);

    await expect(
      page.getByText(/Failed to update workspace doc embedding enabled/i)
    ).toBeVisible();
    await page.context().setOffline(false);
  });

  test('should show embedding progress', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    await page.getByTestId('embedding-progress-wrapper');

    const progress = await page.getByTestId('embedding-progress');
    // wait for the progress to be loading
    const title = await page.getByTestId('embedding-progress-title');
    await expect(title).toHaveText(/Loading sync status/i);
    await expect(progress).not.toBeVisible();

    const count = await page.getByTestId('embedding-progress-count');
    await expect(count).toHaveText(/\d+\/\d+/);
    await expect(progress).toBeVisible();
  });

  test('should allow manual attachment upload for embedding', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    const textContent1 = 'WorkspaceEBEEE is a cute cat';
    const textContent2 = 'WorkspaceEBFFF is a cute dog';
    const buffer1 = Buffer.from(textContent1);
    const buffer2 = Buffer.from(textContent2);
    const attachments = [
      {
        name: 'document1.txt',
        mimeType: 'text/plain',
        buffer: buffer1,
      },
      {
        name: 'document2.txt',
        mimeType: 'text/plain',
        buffer: buffer2,
      },
    ];

    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 1000,
      downloadThroughput: (50 * 1024) / 8,
      uploadThroughput: (50 * 1024) / 8,
      connectionType: 'cellular3g',
    });

    await utils.settings.uploadWorkspaceEmbedding(page, attachments);

    const attachmentList = await page.getByTestId(
      'workspace-embedding-setting-attachment-list'
    );

    // Persisted
    await expect(
      attachmentList.getByTestId('workspace-embedding-setting-attachment-item')
    ).toHaveCount(2);

    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });

    await utils.settings.closeSettingsPanel(page);

    await page.waitForTimeout(5000); // wait for the embedding to be ready

    await utils.chatPanel.makeChat(
      page,
      'What is WorkspaceEBEEE? What is WorkspaceEBFFF?'
    );

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is WorkspaceEBEEE? What is WorkspaceEBFFF?',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/WorkspaceEBEEE.*cat/);
      expect(content).toMatch(/WorkspaceEBFFF.*dog/);
      expect(await message.locator('affine-footnote-node').count()).toBe(2);
    }).toPass({ timeout: 20000 });
  });

  test('should display failed info if upload attachment failed', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    const attachments = [
      {
        name: 'document1.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('HelloWorld'),
      },
    ];

    await page.context().setOffline(true);

    await utils.settings.uploadWorkspaceEmbedding(page, attachments);

    const attachmentList = await page.getByTestId(
      'workspace-embedding-setting-attachment-list'
    );

    const errorItem = await attachmentList.getByTestId(
      'workspace-embedding-setting-attachment-error-item'
    );
    await errorItem.hover();
    await expect(page.getByText(/Network error/i)).toBeVisible();

    await page.context().setOffline(false);
  });

  test('should support hybrid search for both globally uploaded attachments and those uploaded in the current session', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    const hobby1 = Buffer.from('Jerry-Affine love climbing');
    const hobby2 = Buffer.from('Jerry-Affine love skating');
    const attachments = [
      {
        name: 'jerry-affine-hobby.txt',
        mimeType: 'text/plain',
        buffer: hobby1,
      },
    ];
    await utils.settings.uploadWorkspaceEmbedding(page, attachments);

    const attachmentList = await page.getByTestId(
      'workspace-embedding-setting-attachment-list'
    );
    await expect(
      attachmentList.getByTestId('workspace-embedding-setting-attachment-item')
    ).toHaveCount(1);

    await utils.settings.closeSettingsPanel(page);

    await page.waitForTimeout(5000); // wait for the embedding to be ready

    await utils.chatPanel.chatWithAttachments(
      page,
      [
        {
          name: 'jerry-affine-hobby2.txt',
          mimeType: 'text/plain',
          buffer: hobby2,
        },
      ],
      'What is Jerry-Affine hobby?'
    );

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is Jerry-Affine hobby?',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/climbing/i);
      expect(content).toMatch(/skating/i);
      expect(await message.locator('affine-footnote-node').count()).toBe(2);
    }).toPass({ timeout: 20000 });
  });

  test('should support attachments pagination', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    const attachments = Array.from({ length: 11 }, (_, i) => ({
      name: `document${i + 1}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('attachment content'),
    }));

    await utils.settings.uploadWorkspaceEmbedding(page, attachments);

    const attachmentList = await page.getByTestId(
      'workspace-embedding-setting-attachment-list'
    );

    await expect(
      attachmentList.getByTestId('workspace-embedding-setting-attachment-item')
    ).toHaveCount(10);
    const pagination = await attachmentList.getByRole('navigation');
    const currentPage = await pagination.locator('li.active');
    await expect(currentPage).toHaveText('1');

    const page2 = await pagination.locator('li').nth(2);
    await page2.click();

    await expect(
      attachmentList.getByTestId('workspace-embedding-setting-attachment-item')
    ).toHaveCount(1);
    await expect(
      attachmentList
        .getByTestId('workspace-embedding-setting-attachment-item')
        .first()
    ).toHaveText('document1.txt');
  });

  test('should support remove attachment with confirm', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    const textContent = 'WorkspaceEBEEE is a cute cat';
    const attachments = [
      {
        name: 'document1.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(textContent),
      },
    ];
    await utils.settings.uploadWorkspaceEmbedding(page, attachments);

    const attachmentList = await page.getByTestId(
      'workspace-embedding-setting-attachment-list'
    );
    await expect(
      attachmentList.getByTestId('workspace-embedding-setting-attachment-item')
    ).toHaveCount(1);
    await utils.settings.removeAttachment(page, 'document1.txt');
  });

  test('should show error message if remove attachment failed', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    const textContent = 'WorkspaceEBEEE is a cute cat';
    const attachments = [
      {
        name: 'document1.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(textContent),
      },
    ];
    await utils.settings.uploadWorkspaceEmbedding(page, attachments);

    const attachmentList = await page.getByTestId(
      'workspace-embedding-setting-attachment-list'
    );
    await expect(
      attachmentList.getByTestId('workspace-embedding-setting-attachment-item')
    ).toHaveCount(1);

    await page.context().setOffline(true);
    await utils.settings.clickRemoveAttachment(page, 'document1.txt');
    await expect(
      page.getByText(/Failed to remove attachment from embedding/i)
    ).toBeVisible();
    await page.context().setOffline(false);
  });

  test('should support remove error attachment directly', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    const textContent = 'WorkspaceEBEEE is a cute cat';
    const attachments = [
      {
        name: 'document1.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(textContent),
      },
    ];
    await page.context().setOffline(true);
    await utils.settings.uploadWorkspaceEmbedding(page, attachments);
    await utils.settings.removeAttachment(page, 'document1.txt', false);
    await page.context().setOffline(false);
  });

  // FIXME: wait for indexer
  test.skip('should support ignore docs for embedding', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    await utils.settings.closeSettingsPanel(page);
    await utils.editor.createDoc(
      page,
      'WBIgnoreDoc1',
      'WBIgnoreEEE is a cute cat'
    );
    await utils.editor.createDoc(
      page,
      'WBIgnoreDoc2',
      'WBIgnoreFFF is a cute dog'
    );

    await page.waitForTimeout(5000); // wait for the embedding to be ready

    await utils.chatPanel.makeChat(
      page,
      'What is WBIgnoreEEE? What is WBIgnoreFFF?If you dont know, just say "I dont know"'
    );

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content:
          'What is WBIgnoreEEE? What is WBIgnoreFFF?If you dont know, just say "I dont know"',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/WBIgnoreEEE.*cat/);
      expect(content).toMatch(/WBIgnoreFFF.*dog/);
      expect(await message.locator('affine-footnote-node').count()).toBe(2);
    }).toPass({ timeout: 20000 });

    // Ignore docs
    await utils.settings.openSettingsPanel(page);
    await utils.settings.ignoreDocForEmbedding(page, 'WBIgnoreDoc1');
    await utils.settings.ignoreDocForEmbedding(page, 'WBIgnoreDoc2');

    await utils.settings.closeSettingsPanel(page);

    // Clear history
    await utils.chatPanel.clearChat(page);

    // Ignored docs should not be used for embedding
    await utils.chatPanel.makeChat(
      page,
      'What is WBIgnoreEEE? What is WBIgnoreFFF?If you dont know, just say "I dont know"'
    );

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is WBIgnoreEEE? What is WBIgnoreFFF?',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content } = await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/I dont know/i);
    }).toPass({ timeout: 20000 });
  });

  test('should show error message if update ignored docs failed', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.settings.enableWorkspaceEmbedding(page);
    await utils.settings.closeSettingsPanel(page);

    await utils.editor.createDoc(page, 'Test Doc', 'HelloWorld');

    // Ignore docs
    await utils.settings.openSettingsPanel(page);
    await page.context().setOffline(true);
    await utils.settings.ignoreDocForEmbedding(page, 'Test Doc', false);
    await expect(
      page.getByText(/Failed to update ignored docs/i)
    ).toBeVisible();
    await page.context().setOffline(false);
  });
});
