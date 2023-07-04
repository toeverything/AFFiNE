import path from 'node:path';

import fs from 'fs-extra';
import { v4 } from 'uuid';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { removeWithRetry } from '../../../../tests/utils';

const tmpDir = path.join(__dirname, 'tmp');
const appDataPath = path.join(tmpDir, 'app-data');

vi.doMock('../../db/ensure-db', () => ({
  ensureSQLiteDB: async () => ({
    destroy: () => {},
  }),
}));

vi.doMock('../../main-rpc', () => ({
  mainRPC: {
    getPath: async () => appDataPath,
  },
}));

afterEach(async () => {
  await removeWithRetry(tmpDir);
});

describe('list workspaces', () => {
  test('listWorkspaces (valid)', async () => {
    const { listWorkspaces } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(appDataPath, 'workspaces', workspaceId);
    const meta = {
      id: workspaceId,
    };
    await fs.ensureDir(workspacePath);
    await fs.writeJSON(path.join(workspacePath, 'meta.json'), meta);
    const workspaces = await listWorkspaces();
    expect(workspaces).toEqual([[workspaceId, meta]]);
  });

  test('listWorkspaces (without meta json file)', async () => {
    const { listWorkspaces } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(appDataPath, 'workspaces', workspaceId);
    await fs.ensureDir(workspacePath);
    const workspaces = await listWorkspaces();
    expect(workspaces).toEqual([
      [
        workspaceId,
        // meta file will be created automatically
        { id: workspaceId, mainDBPath: path.join(workspacePath, 'storage.db') },
      ],
    ]);
  });
});

describe('delete workspace', () => {
  test('deleteWorkspace', async () => {
    const { deleteWorkspace } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(appDataPath, 'workspaces', workspaceId);
    await fs.ensureDir(workspacePath);
    await deleteWorkspace(workspaceId);
    expect(await fs.pathExists(workspacePath)).toBe(false);
    // removed workspace will be moved to deleted-workspaces
    expect(
      await fs.pathExists(
        path.join(appDataPath, 'deleted-workspaces', workspaceId)
      )
    ).toBe(true);
  });
});

describe('getWorkspaceMeta', () => {
  test('can get meta', async () => {
    const { getWorkspaceMeta } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(appDataPath, 'workspaces', workspaceId);
    const meta = {
      id: workspaceId,
    };
    await fs.ensureDir(workspacePath);
    await fs.writeJSON(path.join(workspacePath, 'meta.json'), meta);
    expect(await getWorkspaceMeta(workspaceId)).toEqual(meta);
  });

  test('can create meta if not exists', async () => {
    const { getWorkspaceMeta } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(appDataPath, 'workspaces', workspaceId);
    await fs.ensureDir(workspacePath);
    expect(await getWorkspaceMeta(workspaceId)).toEqual({
      id: workspaceId,
      mainDBPath: path.join(workspacePath, 'storage.db'),
    });
    expect(
      await fs.pathExists(path.join(workspacePath, 'meta.json'))
    ).toBeTruthy();
  });

  test('can migrate meta if db file is a link', async () => {
    const { getWorkspaceMeta } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(appDataPath, 'workspaces', workspaceId);
    await fs.ensureDir(workspacePath);
    const sourcePath = path.join(tmpDir, 'source.db');
    await fs.writeFile(sourcePath, 'test');

    await fs.ensureSymlink(sourcePath, path.join(workspacePath, 'storage.db'));

    expect(await getWorkspaceMeta(workspaceId)).toEqual({
      id: workspaceId,
      mainDBPath: path.join(workspacePath, 'storage.db'),
      secondaryDBPath: sourcePath,
    });

    expect(
      await fs.pathExists(path.join(workspacePath, 'meta.json'))
    ).toBeTruthy();
  });
});

test('storeWorkspaceMeta', async () => {
  const { storeWorkspaceMeta } = await import('../handlers');
  const workspaceId = v4();
  const workspacePath = path.join(appDataPath, 'workspaces', workspaceId);
  await fs.ensureDir(workspacePath);
  const meta = {
    id: workspaceId,
    mainDBPath: path.join(workspacePath, 'storage.db'),
  };
  await storeWorkspaceMeta(workspaceId, meta);
  expect(await fs.readJSON(path.join(workspacePath, 'meta.json'))).toEqual(
    meta
  );
  await storeWorkspaceMeta(workspaceId, {
    secondaryDBPath: path.join(tmpDir, 'test.db'),
  });
  expect(await fs.readJSON(path.join(workspacePath, 'meta.json'))).toEqual({
    ...meta,
    secondaryDBPath: path.join(tmpDir, 'test.db'),
  });
});
