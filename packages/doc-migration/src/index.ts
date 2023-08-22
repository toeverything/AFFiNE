/**
 * Migrate YDoc from version 0.6.0 to 0.8.0
 */
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  loadYDoc,
  saveFile as saveYDocJSON,
  saveYDocBinary,
  upgradeYDoc,
} from './util';

const folder = 'asset';
const originalDocFile = `${folder}/doc.bin`;
const jsonOutputFile = `${folder}/migrated.json`;

const path = resolve(dirname(fileURLToPath(import.meta.url)), originalDocFile);
const originalDoc = loadYDoc(path);

const migratedDoc = upgradeYDoc(originalDoc);

saveYDocJSON(jsonOutputFile, migratedDoc);
saveYDocBinary(migratedDoc, folder);

// const ids = [...migratedDoc.get('meta').get('pages')].map(ele => ele.get('id'));
