/**
 * Migrate YDoc from version 0.6.0 to 0.8.0
 */
import { migrateToSubdoc } from '@affine/env/blocksuite';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema } from '@blocksuite/store';
import { tryMigrate } from '@blocksuite/store-0.6.0';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadYDoc, saveFile as saveYDocJSON, saveYDocBinary } from './util';

const isBeforeVersion0_6_0 = false;
const folder = 'asset';
const originalDocFile = `${folder}/doc.bin`;
const jsonOutputFile = `${folder}/migrated.json`;

const path = resolve(dirname(fileURLToPath(import.meta.url)), originalDocFile);
const originalDoc = loadYDoc(path);

if (isBeforeVersion0_6_0) {
  tryMigrate(originalDoc); // migrate step1
}
const migratedDoc = migrateToSubdoc(originalDoc); // migrate step2

const intermediateBlockVersions = {
  'affine:code': 1,
  'affine:paragraph': 1,
  'affine:page': 2,
  'affine:list': 1,
  'affine:divider': 1,
  'affine:surface': 3,
  'affine:database': 2,
  'affine:note': 1,
  'affine:image': 1,
};

const globalBlockSuiteSchema = new Schema();
globalBlockSuiteSchema.register(AffineSchemas).register(__unstableSchemas);
globalBlockSuiteSchema.upgradeWorkspace(migratedDoc);
for (const subdoc of [...migratedDoc.subdocs]) {
  globalBlockSuiteSchema.upgradePage(intermediateBlockVersions, subdoc); // migrate step3
}

saveYDocJSON(jsonOutputFile, migratedDoc);
saveYDocBinary(migratedDoc, folder);
