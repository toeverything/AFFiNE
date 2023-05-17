/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { readFile } from 'node:fs/promises';

import { MessageCode } from '@affine/env/constant';
import { createStatusApis } from '@affine/workspace/affine/api/status';
import { KeckProvider } from '@affine/workspace/affine/keck';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import user1 from '@affine-test/fixtures/built-in-user1.json';
import user2 from '@affine-test/fixtures/built-in-user2.json';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists } from '@blocksuite/global/utils';
import type { Page, PageMeta } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';
import { faker } from '@faker-js/faker';
import type {} from '@toeverything/hooks/use-block-suite-page-meta';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import { applyUpdate } from 'yjs';

import {
  createUserApis,
  createWorkspaceApis,
  createWorkspaceResponseSchema,
  RequestError,
  usageResponseSchema,
} from '../api';
import {
  createAffineAuth,
  getLoginStorage,
  loginResponseSchema,
  setLoginStorage,
} from '../login';

// @ts-expect-error
globalThis.WebSocket = WebSocket;

let workspaceApis: ReturnType<typeof createWorkspaceApis>;
let userApis: ReturnType<typeof createUserApis>;
let affineAuth: ReturnType<typeof createAffineAuth>;
let statusApis: ReturnType<typeof createStatusApis>;

function initPage(page: Page) {
  // Add page block and surface block at root level
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(''),
  });
  page.addBlock('affine:surface', {}, pageBlockId);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
  page.resetHistory();
  return {
    pageBlockId,
    frameId,
  } as const;
}

const mockUser = {
  name: faker.name.fullName(),
  email: faker.internet.email(),
  password: faker.internet.password(),
};

async function waitForConnected(provider: KeckProvider) {
  return new Promise<void>(resolve => {
    provider.once('status', ({ status }: any) => {
      expect(status).toBe('connected');
      resolve();
    });
  });
}

beforeEach(() => {
  // create a new user for each test, so that each test can be run independently
  mockUser.name = faker.name.fullName();
  mockUser.email = faker.internet.email();
  mockUser.password = faker.internet.password();
});

beforeEach(() => {
  affineAuth = createAffineAuth('http://127.0.0.1:3000/');
  userApis = createUserApis('http://127.0.0.1:3000/');
  workspaceApis = createWorkspaceApis('http://127.0.0.1:3000/');
  statusApis = createStatusApis('http://127.0.0.1:3000/');
});

beforeEach(async () => {
  expect(await statusApis.healthz(), 'health check').toBe(true);
});

beforeEach(async () => {
  const data = await fetch('http://127.0.0.1:3000/api/user/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'DebugCreateUser',
      ...mockUser,
    }),
  }).then(r => r.json());
  setLoginStorage(data);
  loginResponseSchema.parse(data);
});

declare global {
  interface DocumentEventMap {
    'affine-error': CustomEvent<{
      code: MessageCode;
    }>;
  }
}

async function createWorkspace(
  workspaceApi: typeof workspaceApis,
  callback?: (workspace: Workspace) => void
): Promise<string> {
  const workspace = createEmptyBlockSuiteWorkspace(
    faker.datatype.uuid(),
    WorkspaceFlavour.LOCAL
  );
  if (callback) {
    callback(workspace);
  }
  const binary = Workspace.Y.encodeStateAsUpdate(workspace.doc);
  const data = await workspaceApi.createWorkspace(binary);
  createWorkspaceResponseSchema.parse(data);
  return data.id;
}

describe('api', () => {
  test('built-in mock user', async () => {
    const data = await fetch('http://127.0.0.1:3000/api/user/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DebugLoginUser',
        email: user1.email,
        password: user1.password,
      }),
    }).then(r => r.json());
    loginResponseSchema.parse(data);
    const data2 = await fetch('http://127.0.0.1:3000/api/user/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DebugLoginUser',
        email: user2.email,
        password: user2.password,
      }),
    }).then(r => r.json());
    loginResponseSchema.parse(data2);
  });

  test('failed', async () => {
    workspaceApis = createWorkspaceApis('http://127.0.0.1:10086/404/');
    const listener = vi.fn(
      (
        e: CustomEvent<{
          code: MessageCode;
        }>
      ) => {
        expect(e.detail.code).toBe(MessageCode.loadListFailed);
      }
    );

    document.addEventListener('affine-error', listener);
    expect(listener).toBeCalledTimes(0);
    await workspaceApis.getWorkspaces().catch(e => {
      expect(e).toBeInstanceOf(RequestError);
    });
    expect(listener).toBeCalledTimes(1);
    document.removeEventListener('affine-error', listener);
  });

  test('no permission', async () => {
    await workspaceApis.downloadWorkspace('not-exist').catch(e => {
      expect(e).toBeInstanceOf(RequestError);
      expect(e.code).toBe(MessageCode.noPermission);
    });
  });

  test('blob too large', async () => {
    await workspaceApis
      .uploadBlob('test', new ArrayBuffer(1024 * 1024 * 1024 + 1), 'image/png')
      .catch(e => {
        expect(e).toBeInstanceOf(RequestError);
        expect(e.code).toBe(MessageCode.blobTooLarge);
      });
  });

  test('refresh token', async () => {
    const storage = getLoginStorage();
    assertExists(storage);
    loginResponseSchema.parse(await affineAuth.refreshToken(storage));
  });

  test(
    'create workspace',
    async () => {
      const id = await createWorkspace(workspaceApis);
      expect(id).toBeTypeOf('string');
    },
    {
      timeout: 30000,
    }
  );

  test(
    'delete workspace',
    async () => {
      const id = await createWorkspace(workspaceApis);
      const response = await workspaceApis.deleteWorkspace({
        id,
      });
      expect(response).toBe(true);
    },
    {
      timeout: 30000,
    }
  );

  test('get workspaces', async () => {
    const id = await createWorkspace(workspaceApis);
    const response = await workspaceApis.getWorkspaces();
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBe(1);
    expect(response[0].id).toBe(id);
  });

  test(
    'blob',
    async () => {
      const workspace = new Workspace({
        id: 'test',
      });
      const path = require.resolve('@affine-test/fixtures/smile.png');
      const imageBuffer = await readFile(path);
      const binary = Workspace.Y.encodeStateAsUpdate(workspace.doc);
      const data = await workspaceApis.createWorkspace(binary);
      createWorkspaceResponseSchema.parse(data);
      const workspaceId = data.id;
      const blobId = await workspaceApis.uploadBlob(
        workspaceId,
        imageBuffer,
        'image/png'
      );
      expect(blobId).toBeTypeOf('string');
      const arrayBuffer = await workspaceApis.getBlob(workspaceId, blobId);
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
      expect(arrayBuffer.byteLength).toEqual(imageBuffer.byteLength);
      expect(Buffer.from(arrayBuffer)).toEqual(imageBuffer);
    },
    {
      timeout: 30000,
    }
  );

  test(
    'workspace binary',
    async () => {
      const id = await createWorkspace(workspaceApis);
      await workspaceApis.updateWorkspace({
        id,
        public: true,
      });
      const binary = await workspaceApis.downloadWorkspace(id, false);
      const publicBinary = await workspaceApis.downloadWorkspace(id, true);
      expect(binary).toBeInstanceOf(ArrayBuffer);
      expect(publicBinary).toBeInstanceOf(ArrayBuffer);
      expect(binary).toEqual(publicBinary);
      expect(binary.byteLength).toEqual(publicBinary.byteLength);
    },
    {
      timeout: 30000,
    }
  );

  test('workspace page binary', async () => {
    const id = await createWorkspace(workspaceApis, workspace => {
      {
        const page = workspace.createPage('page0');
        const { frameId } = initPage(page);
        page.addBlock(
          'affine:paragraph',
          {
            text: new page.Text('This is page0'),
          },
          frameId
        );
      }
      {
        const page = workspace.createPage('page1');
        const { frameId } = initPage(page);
        page.addBlock(
          'affine:paragraph',
          {
            text: new page.Text('This is page1'),
          },
          frameId
        );
      }
    });
    await workspaceApis.updateWorkspace({
      id,
      public: true,
    });
    let originalPage0Json: any = null;
    let originalPage1Json: any = null;
    {
      const binary = await workspaceApis.downloadWorkspace(id, false);
      const workspace = new Workspace({
        id: faker.datatype.uuid(),
      })
        .register(AffineSchemas)
        .register(__unstableSchemas);
      applyUpdate(workspace.doc, new Uint8Array(binary));
      const page0 = workspace.getPage('page0') as Page;
      const page1 = workspace.getPage('page1') as Page;
      expect(page0).not.toBeUndefined();
      expect(page1).not.toBeUndefined();
      originalPage0Json = workspace.doc.share.get(page0.prefixedId)?.toJSON();
      originalPage1Json = workspace.doc.share.get(page1.prefixedId)?.toJSON();
    }
    {
      const workspace = new Workspace({
        id: faker.datatype.uuid(),
      })
        .register(AffineSchemas)
        .register(__unstableSchemas);
      const binary = await workspaceApis.downloadPublicWorkspacePage(
        id,
        'page0'
      );
      applyUpdate(workspace.doc, new Uint8Array(binary));
      const page0 = workspace.getPage('page0') as Page;
      expect(page0).not.toBeNull();
      expect(workspace.getPage('page1')).toBeNull();
      expect(workspace.doc.share.get(page0.prefixedId)?.toJSON()).toEqual(
        originalPage0Json
      );
    }
    {
      const workspace = new Workspace({
        id: faker.datatype.uuid(),
      })
        .register(AffineSchemas)
        .register(__unstableSchemas);
      const binary = await workspaceApis.downloadPublicWorkspacePage(
        id,
        'page1'
      );
      applyUpdate(workspace.doc, new Uint8Array(binary));
      const page1 = workspace.getPage('page1') as Page;
      expect(workspace.getPage('page0')).toBeNull();
      expect(page1).not.toBeNull();
      expect(workspace.doc.share.get(page1.prefixedId)?.toJSON()).toEqual(
        originalPage1Json
      );
    }
  });

  test(
    'usage',
    async () => {
      const usageResponse = await userApis.getUsage();
      usageResponseSchema.parse(usageResponse);
      const id = await createWorkspace(workspaceApis);
      const path = require.resolve('@affine-test/fixtures/smile.png');
      const imageBuffer = await readFile(path);
      const blobId = await workspaceApis.uploadBlob(
        id,
        imageBuffer,
        'image/png'
      );
      const buffer = await workspaceApis.getBlob(id, blobId);
      expect(buffer.byteLength).toEqual(imageBuffer.byteLength);
      const newUsageResponse = await userApis.getUsage();
      usageResponseSchema.parse(newUsageResponse);
      expect(usageResponse.blob_usage.usage).not.equals(
        newUsageResponse.blob_usage.usage
      );
      expect(newUsageResponse.blob_usage.usage).equals(96);
    },
    {
      timeout: 30000,
    }
  );

  test(
    'public page',
    async () => {
      const id = await createWorkspace(workspaceApis, workspace => {
        const page = workspace.createPage('page0');
        const { frameId } = initPage(page);
        page.addBlock(
          'affine:paragraph',
          {
            text: new page.Text('This is page0'),
          },
          frameId
        );
      });
      const binary = await workspaceApis.downloadWorkspace(id, false);
      const workspace = createEmptyBlockSuiteWorkspace(
        id,
        WorkspaceFlavour.LOCAL
      );
      Workspace.Y.applyUpdate(workspace.doc, new Uint8Array(binary));
      const workspace2 = createEmptyBlockSuiteWorkspace(
        id,
        WorkspaceFlavour.LOCAL
      );
      {
        const wsUrl = `ws://127.0.0.1:3000/api/sync/`;
        const provider = new KeckProvider(wsUrl, workspace.id, workspace.doc, {
          params: { token: getLoginStorage()?.token },
          awareness: workspace.awarenessStore.awareness,
          connect: false,
        });
        const provider2 = new KeckProvider(
          wsUrl,
          workspace2.id,
          workspace2.doc,
          {
            params: { token: getLoginStorage()?.token },
            awareness: workspace2.awarenessStore.awareness,
            connect: false,
          }
        );

        provider.connect();
        provider2.connect();

        await Promise.all([
          await waitForConnected(provider),
          await waitForConnected(provider2),
        ]);
        const pageId = 'page0';
        const page = workspace.getPage(pageId) as Page;
        expect(page).not.toBeNull();
        expect(page).not.toBeUndefined();
        workspace.setPageMeta(pageId, {
          isPublic: true,
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const page2 = workspace2.getPage(pageId) as Page;
        expect(page2).not.toBeNull();
        const meta = workspace2.meta.getPageMeta(pageId) as PageMeta;
        expect(meta.isPublic).toBe(true);

        const binary = await workspaceApis.downloadPublicWorkspacePage(
          id,
          pageId
        );
        const publicWorkspace = createEmptyBlockSuiteWorkspace(
          id,
          WorkspaceFlavour.LOCAL
        );
        Workspace.Y.applyUpdate(publicWorkspace.doc, new Uint8Array(binary));
        const publicPage = publicWorkspace.getPage(pageId) as Page;
        expect(publicPage).not.toBeNull();
      }
    },
    {
      timeout: 30000,
      retry: 3,
    }
  );
});
