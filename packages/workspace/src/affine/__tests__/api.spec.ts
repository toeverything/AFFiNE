/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import userA from '@affine-test/fixtures/userA.json';
import { assertExists } from '@blocksuite/global/utils';
import { Workspace } from '@blocksuite/store';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { createWorkspaceApis, createWorkspaceResponseSchema } from '../api';
import {
  createAffineAuth,
  getLoginStorage,
  loginResponseSchema,
  setLoginStorage,
} from '../login';

let workspaceApis: ReturnType<typeof createWorkspaceApis>;
let affineAuth: ReturnType<typeof createAffineAuth>;

beforeAll(() => {
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

describe('api', () => {
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
