import fs from 'fs-extra';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

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
