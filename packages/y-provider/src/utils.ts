import type { Doc } from 'yjs';

export function getDoc(doc: Doc, guid: string): Doc | undefined {
  if (doc.guid === guid) {
    return doc;
  }
  for (const subdoc of doc.subdocs) {
    const found = getDoc(subdoc, guid);
    if (found) {
      return found;
    }
  }
  return undefined;
}
