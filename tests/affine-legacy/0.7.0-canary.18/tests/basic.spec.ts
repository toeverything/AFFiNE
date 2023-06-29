import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateToSubdoc } from '@affine/env/blocksuite';
import { Workspace } from '@blocksuite/store';
import { test } from 'vitest';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

test('basic', async () => {
  const oldDoc = new Workspace.Y.Doc();
  const directory = resolve(__dirname, '..', 'fixtures');
  const files = await readdir(directory);
  for (const file of files) {
    if (extname(file) !== '.ydoc') {
      continue;
    }
    const filePath = resolve(directory, file);
    const buffer = await readFile(filePath);
    Workspace.Y.applyUpdate(oldDoc, buffer);
    const newDoc = migrateToSubdoc(oldDoc);
    const workspace = new Workspace({
      id: 'test',
    });
    Workspace.Y.applyUpdate(
      workspace.doc,
      Workspace.Y.encodeStateAsUpdate(newDoc)
    );
    newDoc.subdocs.forEach(subdoc => {
      workspace.doc.subdocs.forEach(workspaceSubDoc => {
        if (subdoc.guid === workspaceSubDoc.guid) {
          Workspace.Y.applyUpdate(
            workspaceSubDoc,
            Workspace.Y.encodeStateAsUpdate(subdoc)
          );
        }
      });
    });
  }
});
