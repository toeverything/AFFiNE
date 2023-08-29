import { equal } from 'node:assert';
import { resolve } from 'node:path';

import { SqliteConnection } from '@affine/native';
import {
  migrateToSubdoc,
  WorkspaceVersion,
} from '@toeverything/infra/blocksuite';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { mainRPC } from '../main-rpc';

export const migrateToSubdocAndReplaceDatabase = async (path: string) => {
  const db = new SqliteConnection(path);
  await db.connect();

  const rows = await db.getAllUpdates();
  const originalDoc = new YDoc();

  // 1. apply all updates to the root doc
  rows.forEach(row => {
    applyUpdate(originalDoc, row.data);
  });

  // 2. migrate using migrateToSubdoc
  const migratedDoc = migrateToSubdoc(originalDoc);

  // 3. replace db rows with the migrated doc
  await replaceRows(db, migratedDoc, true);

  // 4. close db
  await db.close();
};

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, Workspace } from '@blocksuite/store';
import { migrateWorkspace } from '@toeverything/infra/blocksuite';

// v1 v2 -> v3
export const migrateToLatestDatabase = async (path: string) => {
  const connection = new SqliteConnection(path);
  await connection.connect();
  await connection.initVersion();
  const schema = new Schema();
  schema.register(AffineSchemas).register(__unstableSchemas);
  const rootDoc = new YDoc();
  const downloadBinary = async (doc: YDoc, isRoot: boolean): Promise<void> => {
    const update = (
      await connection.getUpdates(isRoot ? undefined : doc.guid)
    ).map(update => update.data);
    // Buffer[] -> Uint8Array
    const data = new Uint8Array(Buffer.concat(update).buffer);
    applyUpdate(doc, data);
    // trigger data manually
    if (isRoot) {
      doc.getMap('meta');
      doc.getMap('spaces');
    } else {
      doc.getMap('blocks');
    }
    await Promise.all(
      [...doc.subdocs].map(subdoc => {
        return downloadBinary(subdoc, false);
      })
    );
  };
  await downloadBinary(rootDoc, true);
  const result = await migrateWorkspace(WorkspaceVersion.SubDoc, {
    getSchema: () => schema,
    getCurrentRootDoc: () => Promise.resolve(rootDoc),
    createWorkspace: () =>
      Promise.resolve(
        new Workspace({
          id: nanoid(10),
          schema,
          blobStorages: [],
          providerCreators: [],
        })
      ),
  });
  equal(
    typeof result,
    'boolean',
    'migrateWorkspace should return boolean value'
  );
  const uploadBinary = async (doc: YDoc, isRoot: boolean) => {
    await connection.replaceUpdates(doc.guid, [
      { docId: isRoot ? undefined : doc.guid, data: encodeStateAsUpdate(doc) },
    ]);
    // connection..applyUpdate(encodeStateAsUpdate(doc), 'self', doc.guid)
    await Promise.all(
      [...doc.subdocs].map(subdoc => {
        return uploadBinary(subdoc, false);
      })
    );
  };
  await uploadBinary(rootDoc, true);
  await connection.close();
};

export const copyToTemp = async (path: string) => {
  const tmpDirPath = resolve(await mainRPC.getPath('sessionData'), 'tmp');
  const tmpFilePath = resolve(tmpDirPath, nanoid());
  await fs.ensureDir(tmpDirPath);
  await fs.copyFile(path, tmpFilePath);
  return tmpFilePath;
};

async function replaceRows(
  db: SqliteConnection,
  doc: YDoc,
  isRoot: boolean
): Promise<void> {
  const migratedUpdates = encodeStateAsUpdate(doc);
  const docId = isRoot ? undefined : doc.guid;
  const rows = [{ data: migratedUpdates, docId: docId }];
  await db.replaceUpdates(docId, rows);
  await Promise.all(
    [...doc.subdocs].map(async subdoc => {
      await replaceRows(db, subdoc, false);
    })
  );
}
