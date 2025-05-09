import path from 'node:path';

import { universalId } from '@affine/nbstore';
import fs from 'fs-extra';
import { v4 } from 'uuid';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';

const tmpDir = path.join(__dirname, 'tmp');
const appDataPath = path.join(tmpDir, 'app-data');

vi.doMock('@affine/electron/helper/db/ensure-db', () => ({
  ensureSQLiteDB: async () => ({
    destroy: () => {},
  }),
}));

vi.doMock('@affine/electron/helper/main-rpc', () => ({
  mainRPC: {
    getPath: async () => appDataPath,
  },
}));

afterEach(async () => {
  try {
    await fs.remove(tmpDir);
  } catch (e) {
    console.error(e);
  }
});

afterAll(() => {
  vi.doUnmock('@affine/electron/helper/main-rpc');
});

describe('workspace db management', () => {
  test('trash workspace', async () => {
    const { trashWorkspace } = await import(
      '@affine/electron/helper/workspace/handlers'
    );
    const workspaceId = v4();
    const workspacePath = path.join(
      appDataPath,
      'workspaces',
      'local',
      workspaceId
    );
    await fs.ensureDir(workspacePath);
    await trashWorkspace(
      universalId({ peer: 'local', type: 'workspace', id: workspaceId })
    );
    expect(await fs.pathExists(workspacePath)).toBe(false);
    // removed workspace will be moved to deleted-workspaces
    expect(
      await fs.pathExists(
        path.join(appDataPath, 'deleted-workspaces', workspaceId)
      )
    ).toBe(true);
  });

  test('delete workspace', async () => {
    const { deleteWorkspace } = await import(
      '@affine/electron/helper/workspace/handlers'
    );
    const workspaceId = v4();
    const workspacePath = path.join(
      appDataPath,
      'workspaces',
      'local',
      workspaceId
    );
    await fs.ensureDir(workspacePath);
    await deleteWorkspace(
      universalId({ peer: 'local', type: 'workspace', id: workspaceId })
    );
    expect(await fs.pathExists(workspacePath)).toBe(false);
    // deleted workspace will remove it permanently
    expect(
      await fs.pathExists(
        path.join(appDataPath, 'deleted-workspaces', workspaceId)
      )
    ).toBe(false);
  });
});
