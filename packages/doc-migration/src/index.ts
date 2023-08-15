import { migrateToSubdoc } from '@affine/env/blocksuite';
import { tryMigrate } from '@blocksuite/store';
import fs from 'fs-extra';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { applyUpdate, Doc } from 'yjs';

function loadYDoc(path: string) {
  const binary = fs.readFileSync(path);
  const doc = new Doc();
  applyUpdate(doc, binary);
  return doc;
}

const folder = 'asset-blog';
const originalDocFile = `${folder}/doc.bin`;
const jsonOutputFile = `${folder}/migrated.json`;

const path = resolve(dirname(fileURLToPath(import.meta.url)), originalDocFile);
const originalDoc = loadYDoc(path);

tryMigrate(originalDoc);
const migratedDoc = migrateToSubdoc(originalDoc);

saveFile(jsonOutputFile, migratedDoc);

function saveFile(path: string, doc: Doc) {
  const jsonPath = resolve(dirname(fileURLToPath(import.meta.url)), path);
  fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));
}
