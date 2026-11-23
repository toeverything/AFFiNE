import path from 'node:path';

import { universalId } from '@affine/nbstore';
import fs from 'fs-extra';
import { v4 } from 'uuid';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVector,
} from 'yjs';

function encodeVarUint(value: number): number[] {
  const out: number[] = [];
  let n = value >>> 0;
  while (n > 0x7f) {
    out.push(0x80 | (n & 0x7f));
    n >>>= 7;
  }
  out.push(n & 0x7f);
  return out;
}

function encodeVarString(value: string): number[] {
  const bytes = Buffer.from(value, 'utf8');
  return [...encodeVarUint(bytes.length), ...bytes];
}

function encodeLegacyContentJsonMeta(
  entries: ReadonlyArray<[string, string]>
): Uint8Array {
  const out: number[] = [];
  // 1 client
  out.push(...encodeVarUint(1));
  // N structs for client 1 starting at clock 0
  out.push(...encodeVarUint(entries.length));
  out.push(...encodeVarUint(1));
  out.push(...encodeVarUint(0));

  for (const [key, jsonElem] of entries) {
    // info = ITEM_HAS_PARENT_SUB (0x20) | Content::Json (2)
    out.push(0x20 | 2);
    // named root
    out.push(1);
    out.push(...encodeVarString('meta'));
    out.push(...encodeVarString(key));
    out.push(...encodeVarUint(1));
    out.push(...encodeVarString(jsonElem));
  }

  // Empty delete set
  out.push(...encodeVarUint(0));
  return new Uint8Array(out);
}

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
  test('deleted workspace metadata includes pending root updates without compacting', async () => {
    const { getDeletedWorkspaces } =
      await import('@affine/electron/helper/workspace/handlers');
    const { getDocStoragePool } =
      await import('@affine/electron/helper/nbstore');
    const workspaceId = v4();
    const dbPath = path.join(
      appDataPath,
      'deleted-workspaces',
      workspaceId,
      'storage.db'
    );
    await fs.ensureDir(path.dirname(dbPath));
    const pool = getDocStoragePool();
    await pool.connect(workspaceId, dbPath);
    const root = new YDoc();
    const meta = root.getMap('meta');
    meta.set('name', 'Before');
    meta.set('pages', [{ id: 'page-a' }]);
    const first = encodeStateAsUpdate(root);
    await pool.pushUpdate(workspaceId, workspaceId, first);
    await pool.getDoc(workspaceId, workspaceId);
    const state = encodeStateVector(root);
    meta.set('name', 'After');
    await pool.pushUpdate(
      workspaceId,
      workspaceId,
      encodeStateAsUpdate(root, state)
    );
    const before = await fs.stat(dbPath);

    const deleted = await getDeletedWorkspaces();
    expect(deleted.items.find(item => item.id === workspaceId)).toMatchObject({
      name: 'After',
      docCount: 1,
    });
    expect((await fs.stat(dbPath)).mtimeMs).toBe(before.mtimeMs);
    expect(
      (await pool.readDocRecordsReadonly(dbPath, workspaceId)).updates
    ).toHaveLength(1);
    await pool.disconnect(workspaceId);
  });

  test('deleted workspace metadata reads Y.Array pages and avatar blob', async () => {
    const { getDeletedWorkspaces } =
      await import('@affine/electron/helper/workspace/handlers');
    const { getDocStoragePool } =
      await import('@affine/electron/helper/nbstore');
    const workspaceId = v4();
    const dbPath = path.join(
      appDataPath,
      'deleted-workspaces',
      workspaceId,
      'storage.db'
    );
    await fs.ensureDir(path.dirname(dbPath));
    const pool = getDocStoragePool();
    await pool.connect(workspaceId, dbPath);

    const avatarKey = 'avatar-blob-key';
    const avatarBytes = new Uint8Array([1, 2, 3, 4]);
    await pool.setBlob(workspaceId, {
      key: avatarKey,
      data: avatarBytes,
      mime: 'image/png',
    });

    const root = new YDoc();
    const meta = root.getMap('meta');
    meta.set('name', 'Workspace With YArray');
    meta.set('avatar', avatarKey);
    const pages = new YArray();
    pages.push([{ id: 'page-1' }, { id: 'page-2' }]);
    meta.set('pages', pages);
    await pool.pushUpdate(workspaceId, workspaceId, encodeStateAsUpdate(root));

    const deleted = await getDeletedWorkspaces();
    const entry = deleted.items.find(item => item.id === workspaceId);
    expect(entry).toMatchObject({
      name: 'Workspace With YArray',
      docCount: 2,
    });
    expect(entry?.avatar).toEqual(avatarBytes);
    await pool.disconnect(workspaceId);
  });

  test('legacy V1 ContentJSON root meta matches Yjs in getDeletedWorkspaces and WorkspaceSQLiteDB', async () => {
    const { getDeletedWorkspaces } =
      await import('@affine/electron/helper/workspace/handlers');
    const { getDocStoragePool } =
      await import('@affine/electron/helper/nbstore');
    const { WorkspaceSQLiteDB } =
      await import('@affine/electron/helper/nbstore/v1/workspace-db-adapter');

    const legacyUpdate = encodeLegacyContentJsonMeta([
      ['name', '"Test"'],
      ['avatar', '"img"'],
      ['pages', '[{"id":"1"},{"id":"2"}]'],
    ]);

    // Ground truth from Yjs
    const ydoc = new YDoc();
    applyUpdate(ydoc, legacyUpdate);
    const yjsMeta = ydoc.getMap('meta').toJSON() as {
      name: string;
      avatar: string;
      pages: unknown[];
    };
    expect(yjsMeta.name).toBe('Test');
    expect(yjsMeta.avatar).toBe('img');
    expect(yjsMeta.pages).toHaveLength(2);

    // 1. nbstore getDeletedWorkspaces
    const workspaceId = v4();
    const dbPath = path.join(
      appDataPath,
      'deleted-workspaces',
      workspaceId,
      'storage.db'
    );
    await fs.ensureDir(path.dirname(dbPath));
    const pool = getDocStoragePool();
    await pool.connect(workspaceId, dbPath);
    await pool.pushUpdate(workspaceId, workspaceId, legacyUpdate);

    const deleted = await getDeletedWorkspaces();
    expect(deleted.items.find(item => item.id === workspaceId)).toMatchObject({
      name: yjsMeta.name,
      docCount: yjsMeta.pages.length,
    });
    await pool.disconnect(workspaceId);

    // 2. Legacy V1 WorkspaceSQLiteDB
    const v1DbPath = path.join(tmpDir, 'v1-legacy-meta.db');
    await fs.ensureDir(path.dirname(v1DbPath));
    await using v1Db = new WorkspaceSQLiteDB(v1DbPath, workspaceId);
    await v1Db.init();
    await v1Db.addUpdateToSQLite(legacyUpdate, workspaceId);
    const v1Meta = await v1Db.getWorkspaceMeta();
    expect(v1Meta).toEqual({
      name: yjsMeta.name,
      avatar: yjsMeta.avatar,
      pageCount: yjsMeta.pages.length,
    });
  });

  test('WorkspaceSQLiteDB tryTrim compacts deleted 4x64KiB payloads and preserves pending out-of-order updates', async () => {
    const { WorkspaceSQLiteDB } =
      await import('@affine/electron/helper/nbstore/v1/workspace-db-adapter');

    // 1. 4x64KiB insert + delete compacted on tryTrim
    const gcDbPath = path.join(tmpDir, 'v1-gc-trim.db');
    const gcWorkspaceId = v4();
    await fs.ensureDir(path.dirname(gcDbPath));

    const gcDoc = new YDoc();
    gcDoc.clientID = 17;
    const gcText = gcDoc.getText('body');
    const chunk = 'x'.repeat(64 * 1024);
    const gcUpdates: Uint8Array[] = [];
    let sv = encodeStateVector(gcDoc);
    for (let i = 0; i < 4; i++) {
      gcText.insert(0, chunk);
      gcUpdates.push(encodeStateAsUpdate(gcDoc, sv));
      sv = encodeStateVector(gcDoc);

      gcText.delete(0, chunk.length);
      gcUpdates.push(encodeStateAsUpdate(gcDoc, sv));
      sv = encodeStateVector(gcDoc);
    }

    {
      await using db = new WorkspaceSQLiteDB(gcDbPath, gcWorkspaceId);
      await db.init();
      await db.adapter.addUpdateToSQLite(
        gcUpdates.map(data => ({ data, docId: undefined }))
      );
    }

    // Reopening calls init() -> tryTrim() which compacts and writes back to SQLite.
    {
      await using reopened = new WorkspaceSQLiteDB(gcDbPath, gcWorkspaceId);
      await reopened.init();
      const rows = await reopened.adapter.getUpdates();
      expect(rows).toHaveLength(1);
      expect(rows[0].data.byteLength).toBeLessThan(64);

      const verifyDoc = new YDoc();
      applyUpdate(verifyDoc, rows[0].data);
      expect(verifyDoc.getText('body').toString()).toBe('');
    }

    // 2. Out-of-order update with missing prior dependency preserved across compaction
    const pendingDbPath = path.join(tmpDir, 'v1-pending-trim.db');
    const pendingWorkspaceId = v4();
    const author = new YDoc();
    author.clientID = 21;
    const authorText = author.getText('body');
    authorText.insert(0, 'hello');
    const u1 = encodeStateAsUpdate(author);
    const sv1 = encodeStateVector(author);
    authorText.insert(5, ' world');
    const u2 = encodeStateAsUpdate(author, sv1);
    const sv2 = encodeStateVector(author);
    authorText.insert(11, '!');
    const u3 = encodeStateAsUpdate(author, sv2);

    {
      await using db = new WorkspaceSQLiteDB(pendingDbPath, pendingWorkspaceId);
      await db.init();
      // Insert u2 and u3 without u1 so tryTrim compacts an incomplete stream.
      await db.adapter.addUpdateToSQLite([
        { data: u2, docId: undefined },
        { data: u3, docId: undefined },
      ]);
    }

    // Reopen triggers tryTrim() on incomplete stream (u2 + u3), then add missing u1.
    {
      await using reopened = new WorkspaceSQLiteDB(
        pendingDbPath,
        pendingWorkspaceId
      );
      await reopened.init();
      await reopened.addUpdateToSQLite(u1, pendingWorkspaceId);
      const merged = await reopened.getDocAsUpdates(pendingWorkspaceId);
      const verifyDoc = new YDoc();
      applyUpdate(verifyDoc, merged);
      expect(verifyDoc.getText('body').toString()).toBe('hello world!');
    }
  });

  test('list local workspace ids', async () => {
    const { listLocalWorkspaceIds } =
      await import('@affine/electron/helper/workspace/handlers');
    const validWorkspaceId = v4();
    const noDbWorkspaceId = v4();
    const deletedWorkspaceId = v4();
    const fileEntry = 'README.txt';

    const validWorkspacePath = path.join(
      appDataPath,
      'workspaces',
      'local',
      validWorkspaceId
    );
    const noDbWorkspacePath = path.join(
      appDataPath,
      'workspaces',
      'local',
      noDbWorkspaceId
    );
    const deletedWorkspacePath = path.join(
      appDataPath,
      'workspaces',
      'local',
      deletedWorkspaceId
    );
    const deletedWorkspaceTrashPath = path.join(
      appDataPath,
      'deleted-workspaces',
      deletedWorkspaceId
    );
    const nonDirectoryPath = path.join(
      appDataPath,
      'workspaces',
      'local',
      fileEntry
    );

    await fs.ensureDir(validWorkspacePath);
    await fs.ensureFile(path.join(validWorkspacePath, 'storage.db'));
    await fs.ensureDir(noDbWorkspacePath);
    await fs.ensureDir(deletedWorkspacePath);
    await fs.ensureFile(path.join(deletedWorkspacePath, 'storage.db'));
    await fs.ensureDir(deletedWorkspaceTrashPath);
    await fs.outputFile(nonDirectoryPath, 'not-a-workspace');

    const ids = await listLocalWorkspaceIds();
    expect(ids).toContain(validWorkspaceId);
    expect(ids).not.toContain(noDbWorkspaceId);
    expect(ids).not.toContain(deletedWorkspaceId);
    expect(ids).not.toContain(fileEntry);
  });

  test('trash workspace', async () => {
    const { trashWorkspace } =
      await import('@affine/electron/helper/workspace/handlers');
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
    const { deleteWorkspace } =
      await import('@affine/electron/helper/workspace/handlers');
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

  test.each([
    {
      name: 'deleting a workspace',
      outsideDirName: 'outside-delete-target',
      call: async () => {
        const { deleteWorkspace } =
          await import('@affine/electron/helper/workspace/handlers');
        return deleteWorkspace(
          universalId({
            peer: 'local',
            type: 'workspace',
            id: '../../outside-delete-target',
          })
        );
      },
    },
    {
      name: 'deleting backup workspaces',
      outsideDirName: 'outside-backup-target',
      call: async () => {
        const { deleteBackupWorkspace } =
          await import('@affine/electron/helper/workspace/handlers');
        return deleteBackupWorkspace('../../outside-backup-target');
      },
    },
    {
      name: 'recovering backup workspaces',
      outsideDirName: 'outside-recover-target',
      call: async () => {
        const { recoverBackupWorkspace } =
          await import('@affine/electron/helper/workspace/handlers');
        return recoverBackupWorkspace('../../outside-recover-target');
      },
    },
  ])('rejects unsafe ids when $name', async ({ outsideDirName, call }) => {
    const outsideDir = path.join(tmpDir, outsideDirName);

    await fs.ensureDir(outsideDir);

    await expect(call()).rejects.toThrow('Invalid workspace id');
    expect(await fs.pathExists(outsideDir)).toBe(true);
  });
});
