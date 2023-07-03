import path from 'node:path';

import fs from 'fs-extra';
import { v4 } from 'uuid';
import { afterEach, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import { removeWithRetry } from '../../../../tests/utils';
import { dbSubjects } from '../subjects';

const tmpDir = path.join(__dirname, 'tmp');
const appDataPath = path.join(tmpDir, 'app-data');

vi.doMock('../../main-rpc', () => ({
  mainRPC: {
    getPath: async () => appDataPath,
  },
}));

afterEach(async () => {
  await removeWithRetry(tmpDir);
});

let testYDoc: Y.Doc;
let testYSubDoc: Y.Doc;

function getTestUpdates() {
  testYDoc = new Y.Doc();
  const yText = testYDoc.getText('test');
  yText.insert(0, 'hello');

  testYSubDoc = new Y.Doc();
  testYDoc.getMap('subdocs').set('test-subdoc', testYSubDoc);

  const updates = Y.encodeStateAsUpdate(testYDoc);

  return updates;
}

function getTestSubDocUpdates() {
  const yText = testYSubDoc.getText('test');
  yText.insert(0, 'hello');

  const updates = Y.encodeStateAsUpdate(testYSubDoc);

  return updates;
}

test('can create new db file if not exists', async () => {
  const { openWorkspaceDatabase } = await import('../workspace-db-adapter');
  const workspaceId = v4();
  const db = await openWorkspaceDatabase(workspaceId);
  const dbPath = path.join(
    appDataPath,
    `workspaces/${workspaceId}`,
    `storage.db`
  );
  expect(await fs.exists(dbPath)).toBe(true);
  await db.destroy();
});

test('on applyUpdate (from self), will not trigger update', async () => {
  const { openWorkspaceDatabase } = await import('../workspace-db-adapter');
  const workspaceId = v4();
  const onUpdate = vi.fn();

  const db = await openWorkspaceDatabase(workspaceId);
  db.update$.subscribe(onUpdate);
  db.applyUpdate(getTestUpdates(), 'self');
  expect(onUpdate).not.toHaveBeenCalled();
  await db.destroy();
});

test('on applyUpdate (from renderer), will trigger update', async () => {
  const { openWorkspaceDatabase } = await import('../workspace-db-adapter');
  const workspaceId = v4();
  const onUpdate = vi.fn();
  const onExternalUpdate = vi.fn();

  const db = await openWorkspaceDatabase(workspaceId);
  db.update$.subscribe(onUpdate);
  const sub = dbSubjects.externalUpdate.subscribe(onExternalUpdate);
  db.applyUpdate(getTestUpdates(), 'renderer');
  expect(onUpdate).toHaveBeenCalled();
  sub.unsubscribe();
  await db.destroy();
});

test('on applyUpdate (from renderer, subdoc), will trigger update', async () => {
  const { openWorkspaceDatabase } = await import('../workspace-db-adapter');
  const workspaceId = v4();
  const onUpdate = vi.fn();
  const insertUpdates = vi.fn();

  const db = await openWorkspaceDatabase(workspaceId);
  db.applyUpdate(getTestUpdates(), 'renderer');

  db.db!.insertUpdates = insertUpdates;
  db.update$.subscribe(onUpdate);

  const subdocUpdates = getTestSubDocUpdates();
  db.applyUpdate(subdocUpdates, 'renderer', testYSubDoc.guid);

  expect(onUpdate).toHaveBeenCalled();
  expect(insertUpdates).toHaveBeenCalledWith([
    {
      docId: testYSubDoc.guid,
      data: subdocUpdates,
    },
  ]);
  await db.destroy();
});

test('on applyUpdate (from external), will trigger update & send external update event', async () => {
  const { openWorkspaceDatabase } = await import('../workspace-db-adapter');
  const workspaceId = v4();
  const onUpdate = vi.fn();
  const onExternalUpdate = vi.fn();

  const db = await openWorkspaceDatabase(workspaceId);
  db.update$.subscribe(onUpdate);
  const sub = dbSubjects.externalUpdate.subscribe(onExternalUpdate);
  db.applyUpdate(getTestUpdates(), 'external');
  expect(onUpdate).toHaveBeenCalled();
  expect(onExternalUpdate).toHaveBeenCalled();
  sub.unsubscribe();
  await db.destroy();
});

test('on destroy, check if resources have been released', async () => {
  const { openWorkspaceDatabase } = await import('../workspace-db-adapter');
  const workspaceId = v4();
  const db = await openWorkspaceDatabase(workspaceId);
  const updateSub = {
    complete: vi.fn(),
    next: vi.fn(),
  };
  db.update$ = updateSub as any;
  await db.destroy();
  expect(db.db).toBe(null);
  expect(updateSub.complete).toHaveBeenCalled();
});
