import path from 'node:path';

import { removeWithRetry } from '@affine-test/kit/utils/utils';
import fs from 'fs-extra';
import { v4 } from 'uuid';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';

const tmpDir = path.join(__dirname, 'tmp');
const appDataPath = path.join(tmpDir, 'app-data');

beforeAll(() => {
  vi.doMock('@affine/electron/helper/main-rpc', () => ({
    mainRPC: {
      getPath: async () => appDataPath,
    },
  }));
});

afterEach(async () => {
  await removeWithRetry(tmpDir);
});

afterAll(() => {
  vi.doUnmock('@affine/electron/helper/main-rpc');
});

test('can create new db file if not exists', async () => {
  const { openWorkspaceDatabase } = await import(
    '@affine/electron/helper/db/workspace-db-adapter'
  );
  const workspaceId = v4();
  const db = await openWorkspaceDatabase('workspace', workspaceId);
  const dbPath = path.join(
    appDataPath,
    `workspaces/${workspaceId}`,
    `storage.db`
  );
  expect(await fs.exists(dbPath)).toBe(true);
  await db.destroy();
});

test('on destroy, check if resources have been released', async () => {
  const { openWorkspaceDatabase } = await import(
    '@affine/electron/helper/db/workspace-db-adapter'
  );
  const workspaceId = v4();
  const db = await openWorkspaceDatabase('workspace', workspaceId);
  const updateSub = {
    complete: vi.fn(),
    next: vi.fn(),
  };
  db.update$ = updateSub as any;
  await db.destroy();
  expect(db.adapter.db).toBe(null);
  expect(updateSub.complete).toHaveBeenCalled();
});
