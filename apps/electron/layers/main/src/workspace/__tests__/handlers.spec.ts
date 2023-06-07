import path from 'node:path';

import fs from 'fs-extra';
import { v4 } from 'uuid';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { AppContext } from '../../context';

const tmpDir = path.join(__dirname, 'tmp');

const testAppContext: AppContext = {
  appDataPath: path.join(tmpDir, 'test-data'),
  appName: 'test',
};

vi.doMock('../../context', () => ({
  appContext: testAppContext,
}));

vi.doMock('../../db/ensure-db', () => ({
  ensureSQLiteDB: async () => ({
    destroy: () => {},
  }),
}));

afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('list workspaces', () => {
  test('listWorkspaces (valid)', async () => {
    const { listWorkspaces } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(
      testAppContext.appDataPath,
      'workspaces',
      workspaceId
    );
    const meta = {
      id: workspaceId,
    };
    await fs.ensureDir(workspacePath);
    await fs.writeJSON(path.join(workspacePath, 'meta.json'), meta);
    const workspaces = await listWorkspaces(testAppContext);
    expect(workspaces).toEqual([[workspaceId, meta]]);
  });

  test('listWorkspaces (without meta json file)', async () => {
    const { listWorkspaces } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(
      testAppContext.appDataPath,
      'workspaces',
      workspaceId
    );
    await fs.ensureDir(workspacePath);
    const workspaces = await listWorkspaces(testAppContext);
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
    const workspacePath = path.join(
      testAppContext.appDataPath,
      'workspaces',
      workspaceId
    );
    await fs.ensureDir(workspacePath);
    await deleteWorkspace(testAppContext, workspaceId);
    expect(await fs.pathExists(workspacePath)).toBe(false);
    // removed workspace will be moved to delete-workspaces
    expect(
      await fs.pathExists(
        path.join(testAppContext.appDataPath, 'delete-workspaces', workspaceId)
      )
    ).toBe(true);
  });
});

describe('getWorkspaceMeta', () => {
  test('can get meta', async () => {
    const { getWorkspaceMeta } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(
      testAppContext.appDataPath,
      'workspaces',
      workspaceId
    );
    const meta = {
      id: workspaceId,
    };
    await fs.ensureDir(workspacePath);
    await fs.writeJSON(path.join(workspacePath, 'meta.json'), meta);
    expect(await getWorkspaceMeta(testAppContext, workspaceId)).toEqual(meta);
  });

  test('can create meta if not exists', async () => {
    const { getWorkspaceMeta } = await import('../handlers');
    const workspaceId = v4();
    const workspacePath = path.join(
      testAppContext.appDataPath,
      'workspaces',
      workspaceId
    );
    await fs.ensureDir(workspacePath);
    expect(await getWorkspaceMeta(testAppContext, workspaceId)).toEqual({
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
    const workspacePath = path.join(
      testAppContext.appDataPath,
      'workspaces',
      workspaceId
    );
    await fs.ensureDir(workspacePath);
    const sourcePath = path.join(tmpDir, 'source.db');
    await fs.writeFile(sourcePath, 'test');

    await fs.ensureSymlink(sourcePath, path.join(workspacePath, 'storage.db'));

    expect(await getWorkspaceMeta(testAppContext, workspaceId)).toEqual({
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
  const workspacePath = path.join(
    testAppContext.appDataPath,
    'workspaces',
    workspaceId
  );
  await fs.ensureDir(workspacePath);
  const meta = {
    id: workspaceId,
    mainDBPath: path.join(workspacePath, 'storage.db'),
  };
  await storeWorkspaceMeta(testAppContext, workspaceId, meta);
  expect(await fs.readJSON(path.join(workspacePath, 'meta.json'))).toEqual(
    meta
  );
  await storeWorkspaceMeta(testAppContext, workspaceId, {
    secondaryDBPath: path.join(tmpDir, 'test.db'),
  });
  expect(await fs.readJSON(path.join(workspacePath, 'meta.json'))).toEqual({
    ...meta,
    secondaryDBPath: path.join(tmpDir, 'test.db'),
  });
});
