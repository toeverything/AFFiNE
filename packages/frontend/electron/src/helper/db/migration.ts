import { equal } from 'node:assert';
import { resolve } from 'node:path';

import { SqliteConnection } from '@affine/native';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema } from '@blocksuite/store';
import {
  forceUpgradePages,
  guidCompatibilityFix,
  migrateToSubdoc,
  WorkspaceVersion,
} from '@toeverything/infra/blocksuite';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';
import type { Doc } from 'yjs';
import { type Array as YArray, Map as YMap } from 'yjs';
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

// v1 v2 -> v3
// v3 -> v4
export const migrateToLatest = async (
  path: string,
  version: WorkspaceVersion
) => {
  const connection = new SqliteConnection(path);
  await connection.connect();
  if (version === WorkspaceVersion.SubDoc) {
    await connection.initVersion();
  } else {
    await connection.setVersion(version);
  }
  const schema = new Schema();
  schema.register(AffineSchemas).register(__unstableSchemas);
  const rootDoc = new YDoc();
  const downloadBinary = async (doc: YDoc, isRoot: boolean): Promise<void> => {
    const update = (
      await connection.getUpdates(isRoot ? undefined : doc.guid)
    ).map(update => update.data);
    // Buffer[] -> Uint8Array[]
    const data = update.map(update => new Uint8Array(update));
    data.forEach(data => {
      applyUpdate(doc, data);
    });
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
  const result = await forceUpgradePages(rootDoc, schema);
  equal(result, true, 'migrateWorkspace should return boolean value');
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

export const applyGuidCompatibilityFix = async (db: SqliteConnection) => {
  const oldRows = await db.getUpdates(undefined);

  const rootDoc = new YDoc();
  oldRows.forEach(row => applyUpdate(rootDoc, row.data));

  // see comments of guidCompatibilityFix
  guidCompatibilityFix(rootDoc);

  // todo: backup?
  await db.replaceUpdates(undefined, [
    {
      docId: undefined,
      data: encodeStateAsUpdate(rootDoc),
    },
  ]);

  await fixDanglingSubdocs(db);
};

export const fixDanglingSubdocs = async (db: SqliteConnection) => {
  const allRows = await db.getAllUpdates();
  const rowsByDocId = allRows.reduce((acc, row) => {
    const docId = row.docId;
    if (!acc.has(docId)) {
      acc.set(docId, []);
    }
    acc.get(docId)?.push(row);
    return acc;
  }, new Map<string | undefined, { data: Uint8Array; docId?: string }[]>());
  const rootDoc = new YDoc();
  rowsByDocId.get(undefined)?.forEach(row => applyUpdate(rootDoc, row.data));

  const spaces = rootDoc.getMap<Doc>('spaces');

  const pagesInMeta = rootDoc.getMap('meta').get('pages') as
    | YArray<YMap<string>>
    | undefined;

  if (!pagesInMeta) {
    return;
  }

  const pageIdsInMeta: string[] =
    pagesInMeta.toJSON().map(page => page.id) ?? [];

  const docIdsInRows = [...rowsByDocId.keys()].filter(Boolean) as string[];

  const docIdInSpaces = [...spaces.values()].map(doc => doc.guid);

  // find dangling subdocs (exists in rows but not in meta)
  const danglingPageIds = docIdsInRows.filter(
    pageId => !docIdInSpaces.includes(pageId) && !pageIdsInMeta.includes(pageId)
  );

  // remove sub doc in spaces that does not exist in rows
  for (const pageId of docIdInSpaces) {
    if (!docIdsInRows.includes(pageId)) {
      spaces.delete(pageId);
    }
  }

  const whitePageInMeta = pagesInMeta
    .toJSON()
    .filter(page => !rowsByDocId.get(spaces.get(page.id)?.guid));

  // use intrinsics to fix dangling subdocs
  for (const danglingPageId of danglingPageIds) {
    const danglingRows = rowsByDocId.get(danglingPageId);
    const danglingDoc = new YDoc();
    danglingRows?.forEach(row => applyUpdate(danglingDoc, row.data));
    danglingDoc.guid = danglingPageId;

    // check if the same meta exists
    const danglingDocTitle: string = Object.values(
      danglingDoc.getMap('blocks').toJSON()
    ).find(b => b['sys:flavour'])?.['prop:title'];

    console.log(
      'danglingPageId:danglingDocTitle',
      danglingPageId,
      danglingDocTitle
    );

    const sameMeta = whitePageInMeta.find(p => p.title === danglingDocTitle);

    if (sameMeta) {
      console.log('borrowed createDate from', sameMeta);
    }

    // add dangling page to meta
    pagesInMeta.push([
      new YMap(
        Object.entries({
          id: danglingPageId,
          title: danglingDocTitle,
          createDate: sameMeta?.createDate ?? new Date().getTime(),
          updatedDate: sameMeta?.updatedDate ?? new Date().getTime(),
        })
      ),
    ]);
    // add dangling doc to spaces
    spaces.set(danglingPageId, danglingDoc);
  }

  // get all the pages that in meta but not in rows
  pagesInMeta
    .toJSON()
    .filter(page => !rowsByDocId.get(spaces.get(page.id)?.guid))
    .forEach(page => {
      const idx = pagesInMeta.toArray().findIndex(p => p.get('id') === page.id);
      pagesInMeta.delete(idx);
      console.log('delete white page', page.id, page.title);
    });

  await db.replaceUpdates(undefined, [
    {
      docId: undefined,
      data: encodeStateAsUpdate(rootDoc),
    },
  ]);
};
