/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { MessageCode } from '@affine/env/constant';
import userA from '@affine-test/fixtures/userA.json';
import { assertExists } from '@blocksuite/global/utils';
import { Workspace } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createWorkspaceApis,
  createWorkspaceResponseSchema,
  RequestError,
} from '../api';
import {
  createAffineAuth,
  getLoginStorage,
  loginResponseSchema,
  setLoginStorage,
} from '../login';

let workspaceApis: ReturnType<typeof createWorkspaceApis>;
let affineAuth: ReturnType<typeof createAffineAuth>;

beforeEach(() => {
  affineAuth = createAffineAuth('http://localhost:3000/');
  workspaceApis = createWorkspaceApis('http://localhost:3000/');
});

beforeEach(async () => {
  let data;
  // first step: try to log in
  const response = await fetch('http://localhost:3000/api/user/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'DebugLoginUser',
      email: userA.email,
      password: userA.password,
    }),
  });
  if (!response.ok) {
    data = await fetch('http://localhost:3000/api/user/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DebugCreateUser',
        ...userA,
      }),
    }).then(r => r.json());
    setLoginStorage(data);
  } else {
    setLoginStorage((data = await response.json()));
  }
  loginResponseSchema.parse(data);
});

declare global {
  interface DocumentEventMap {
    'affine-error': CustomEvent<{
      code: MessageCode;
    }>;
  }
}

describe('api', () => {
  test('failed', async () => {
    workspaceApis = createWorkspaceApis('http://localhost:10086/404/');
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

  test('refresh token', async () => {
    const storage = getLoginStorage();
    assertExists(storage);
    loginResponseSchema.parse(await affineAuth.refreshToken(storage));
  });

  test(
    'create workspace',
    async () => {
      const workspace = new Workspace({
        id: 'test',
      });
      const binary = Workspace.Y.encodeStateAsUpdate(workspace.doc);
      const data = await workspaceApis.createWorkspace(new Blob([binary]));
      createWorkspaceResponseSchema.parse(data);
    },
    {
      timeout: 30000,
    }
  );

  test(
    'delete workspace',
    async () => {
      const workspace = new Workspace({
        id: 'test',
      });
      const binary = Workspace.Y.encodeStateAsUpdate(workspace.doc);
      const data = await workspaceApis.createWorkspace(new Blob([binary]));
      createWorkspaceResponseSchema.parse(data);
      const id = data.id;
      const response = await workspaceApis.deleteWorkspace({
        id,
      });
      expect(response).toBe(true);
    },
    {
      timeout: 30000,
    }
  );
});
