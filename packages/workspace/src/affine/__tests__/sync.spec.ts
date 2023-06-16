/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { WorkspaceFlavour } from '@affine/env/workspace';
import type { Workspace } from '@affine/env/workspace/legacy-cloud';
import { PermissionType } from '@affine/env/workspace/legacy-cloud';
import user1 from '@affine-test/fixtures/built-in-user1.json';
import user2 from '@affine-test/fixtures/built-in-user2.json';
import type { ParagraphBlockModel } from '@blocksuite/blocks/models';
import type { Page, Text } from '@blocksuite/store';
import { uuidv4, Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';

import type { LoginResponse } from '../../affine/login';
import { loginResponseSchema } from '../../affine/login';
import { createEmptyBlockSuiteWorkspace } from '../../utils';
import { createWorkspaceApis } from '../api';
import { KeckProvider } from '../keck';

declare module '@blocksuite/store' {
  interface PageMeta {
    foo: string;
  }
}

// @ts-expect-error
globalThis.WebSocket = WebSocket;

const currentTokenRef = {
  current: null as LoginResponse | null,
};

vi.stubGlobal('localStorage', {
  getItem: () => JSON.stringify(currentTokenRef.current),
  setItem: () => null,
});

let workspaceApis: ReturnType<typeof createWorkspaceApis>;

let user1Token: LoginResponse;
let user2Token: LoginResponse;

beforeEach(() => {
  workspaceApis = createWorkspaceApis('http://127.0.0.1:3000/');
});

beforeEach(async () => {
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
  user1Token = data;
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
  user2Token = data2;
});

const wsUrl = `ws://127.0.0.1:3000/api/sync/`;

describe('ydoc sync', () => {
  test(
    'page',
    async () => {
      currentTokenRef.current = user1Token;
      const list = await workspaceApis.getWorkspaces();
      const root = list.find(
        workspace => workspace.permission === PermissionType.Owner
      ) as Workspace;
      expect(root).toBeDefined();
      const binary = await workspaceApis.downloadWorkspace(root.id);
      const workspace1 = createEmptyBlockSuiteWorkspace(
        root.id,
        WorkspaceFlavour.AFFINE,
        {
          workspaceApis,
        }
      );
      const workspace2 = createEmptyBlockSuiteWorkspace(
        root.id,
        WorkspaceFlavour.AFFINE,
        {
          workspaceApis,
        }
      );
      BlockSuiteWorkspace.Y.applyUpdate(workspace1.doc, new Uint8Array(binary));
      BlockSuiteWorkspace.Y.applyUpdate(workspace2.doc, new Uint8Array(binary));
      const provider1 = new KeckProvider(wsUrl, workspace1.id, workspace1.doc, {
        params: { token: user1Token.token },
        awareness: workspace1.awarenessStore.awareness,
        // @ts-expect-error
        disableBc: true,
        connect: false,
      });

      const provider2 = new KeckProvider(wsUrl, workspace2.id, workspace2.doc, {
        params: { token: user2Token.token },
        awareness: workspace2.awarenessStore.awareness,
        // @ts-expect-error
        disableBc: true,
        connect: false,
      });

      provider1.connect();
      provider2.connect();

      function waitForConnected(provider: KeckProvider) {
        return new Promise<void>(resolve => {
          provider.once('status', ({ status }: any) => {
            expect(status).toBe('connected');
            resolve();
          });
        });
      }

      await Promise.all([
        waitForConnected(provider1),
        waitForConnected(provider2),
      ]);

      const pageId = uuidv4();
      const page1 = workspace1.createPage(pageId);
      const pageBlockId = page1.addBlock('affine:page', {
        title: new page1.Text(''),
      });
      page1.addBlock('affine:surface', {}, pageBlockId);
      const frameId = page1.addBlock('affine:frame', {}, pageBlockId);
      const paragraphId = page1.addBlock('affine:paragraph', {}, frameId);
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(workspace2.getPage(pageId)).toBeDefined();
      expect(workspace2.doc.getMap(`space:${pageId}`).toJSON()).toEqual(
        workspace1.doc.getMap(`space:${pageId}`).toJSON()
      );
      const page2 = workspace2.getPage(pageId) as Page;
      page1.updateBlock(
        page1.getBlockById(paragraphId) as ParagraphBlockModel,
        {
          text: new page1.Text('hello world'),
        }
      );
      workspace1.meta.setPageMeta(pageId, {
        foo: 'bar',
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      const pageMeta = workspace2.meta.getPageMeta(pageId);
      expect(pageMeta).toBeDefined();
      expect(pageMeta?.foo).toBe('bar');
      const paragraph2 = page2.getBlockById(paragraphId) as ParagraphBlockModel;
      const text = paragraph2.text as Text;
      expect(text.toString()).toEqual(
        page1.getBlockById(paragraphId)?.text?.toString()
      );

      provider1.disconnect();
      provider2.disconnect();
    },
    {
      timeout: 30000,
      retry: 3,
    }
  );
});
