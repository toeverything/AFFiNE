import { migrateToSubdoc } from '@affine/env/blocksuite';
import { SqliteConnection } from '@affine/native';
import * as Y from 'yjs';

export const migrateToSubdocAndReplaceDatabase = async (path: string) => {
  const db = new SqliteConnection(path);
  await db.connect();

  const rows = await db.getAllUpdates();
  const originalDoc = new Y.Doc();

  // 1. apply all updates to the root doc
  rows.forEach(row => {
    Y.applyUpdate(originalDoc, row.data);
  });

  console.log(originalDoc.toJSON());

  // 2. migrate using migrateToSubdoc
  const migratedDoc = migrateToSubdoc(originalDoc);

  // 3. replace db rows with the migrated doc
  await replaceRows(db, migratedDoc, true);

  // 4. close db
  await db.close();
};

async function replaceRows(
  db: SqliteConnection,
  doc: Y.Doc,
  isRoot: boolean
): Promise<void> {
  const migratedUpdates = Y.encodeStateAsUpdate(doc);
  const rows = [
    { data: migratedUpdates, docId: isRoot ? undefined : doc.guid },
  ];
  await db.replaceUpdates(doc.guid, rows);
  await Promise.all(
    [...doc.subdocs].map(async subdoc => {
      await replaceRows(db, subdoc, false);
    })
  );
}
