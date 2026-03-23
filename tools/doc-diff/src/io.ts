import { readFileSync } from 'node:fs';
import path from 'node:path';

import { applyUpdate, Doc } from 'yjs';

export function getDisplayLabel(inputPath: string) {
  const resolved = path.resolve(process.cwd(), inputPath);
  if (resolved === inputPath) {
    return inputPath;
  }
  return `${inputPath} (${resolved})`;
}

export function readYjsDocFromFile(filePath: string): Doc {
  const bin = readFileSync(filePath);
  const doc = new Doc();
  applyUpdate(doc, new Uint8Array(bin));
  return doc;
}
