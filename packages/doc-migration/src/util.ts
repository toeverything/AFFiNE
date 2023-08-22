import { migrateToSubdoc } from '@affine/env/blocksuite';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema } from '@blocksuite/store';
import { tryMigrate } from '@blocksuite/store-0.6.0';
import fs from 'fs-extra';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Array as YArray, Map as YMap } from 'yjs';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

import { prismaNewService, prismOldService } from './prisma';

export function loadYDoc(path: string) {
  const binary = fs.readFileSync(path);
  const doc = new Doc();
  applyUpdate(doc, binary);
  return doc;
}

export function saveFile(path: string, doc: Doc) {
  const jsonPath = resolve(dirname(fileURLToPath(import.meta.url)), path);
  fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));
}

export function saveYDocBinary(rootDoc: Doc, folder: string) {
  const map: Record<string, string> = {};
  rootDoc.guid = 'rootDoc';
  const docs: Doc[] = [rootDoc];
  while (docs.length > 0) {
    const doc = docs.shift();
    if (!doc) break;
    if (doc.subdocs) {
      for (const subdoc of doc.subdocs) {
        docs.push(subdoc);
      }
    }
    map[doc.guid] = Buffer.from(encodeStateAsUpdate(doc)).toString('base64');
  }

  const output = JSON.stringify(map);
  const docPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    `${folder}/saved_doc.base64`
  );
  fs.writeFileSync(docPath, output, 'utf-8');
}

export function upgradeYDoc(
  originalDoc: Doc,
  isBeforeVersion0_6_0 = false
): Doc {
  if (isBeforeVersion0_6_0) {
    tryMigrate(originalDoc); // upgrade step1
  }
  const migratedDoc = migrateToSubdoc(originalDoc); // upgrade step2

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
    globalBlockSuiteSchema.upgradePage(intermediateBlockVersions, subdoc); // upgrade step3
  }

  return migratedDoc;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function migrateYDoc() {
  const docs = await prismOldService.getYDocs();
  const saveMigratedDoc = async (migratedDoc: Doc) => {
    const workspaceId = migratedDoc.guid;
    await prismaNewService.insertYDoc(
      workspaceId,
      migratedDoc.guid,
      encodeStateAsUpdate(migratedDoc)
    );

    const subDocs = migratedDoc.get('spaces') as YMap<unknown>;
    for (const id of [
      ...((migratedDoc.get('meta') as YMap<unknown>).get('pages') as YArray<
        YMap<unknown>
      >),
    ].map(ele => ele.get('id'))) {
      const subDoc = subDocs.get(id as string) as Doc;
      await prismaNewService.insertYDoc(
        workspaceId,
        subDoc.guid,
        encodeStateAsUpdate(subDoc)
      );
    }
  };

  for (const doc of docs) {
    const migratedDoc = upgradeYDoc(doc);
    await saveMigratedDoc(migratedDoc);
  }
}
