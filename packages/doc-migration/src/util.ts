import { migrateToSubdoc } from '@affine/env/blocksuite';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema } from '@blocksuite/store';
import { tryMigrate } from '@blocksuite/store-0.6.0';
import fs from 'fs-extra';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

import { prismaNewService } from './prisma';

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

export async function saveMigratedDocToUpdate(
  workspaceId: string,
  migratedDoc: Doc,
  createdAt: Date
) {
  await prismaNewService.insertYDocToUpdate(
    workspaceId,
    migratedDoc.guid,
    encodeStateAsUpdate(migratedDoc),
    createdAt
  );

  for (const subDoc of migratedDoc.subdocs) {
    saveMigratedDocToUpdate(workspaceId, subDoc, createdAt);
  }
}

export async function saveMigratedDocToSnapshot(
  workspaceId: string,
  migratedDoc: Doc,
  createdAt: Date,
  updatedAt: Date
) {
  await prismaNewService.insertYDocToSnapshot(
    workspaceId,
    migratedDoc.guid,
    encodeStateAsUpdate(migratedDoc),
    createdAt,
    updatedAt
  );

  for (const subDoc of migratedDoc.subdocs) {
    saveMigratedDocToSnapshot(workspaceId, subDoc, createdAt, updatedAt);
  }
}
