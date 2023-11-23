import type { Array as YArray, Map as YMap } from 'yjs';
import { Doc as YDoc, transact } from 'yjs';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

// patch root doc's space guid compatibility issue
//
// in version 0.10, page id in spaces no longer has prefix "space:"
// The data flow for fetching a doc's updates is:
// - page id in `meta.pages` -> find `${page-id}` in `doc.spaces` -> `doc` -> `doc.guid`
// if `doc` is not found in `doc.spaces`, a new doc will be created and its `doc.guid` is the same with its pageId
// - because of guid logic change, the doc that previously prefixed with "space:" will not be found in `doc.spaces`
// - when fetching the rows of this doc using the doc id === page id,
//   it will return empty since there is no updates associated with the page id
export function guidCompatibilityFix(rootDoc: YDoc) {
  let changed = false;
  transact(rootDoc, () => {
    const meta = rootDoc.getMap('meta') as YMap<unknown>;
    const pages = meta.get('pages') as YArray<YMap<unknown>>;
    pages?.forEach(page => {
      const pageId = page.get('id') as string | undefined;
      if (pageId?.includes(':')) {
        // remove the prefix "space:" from page id
        page.set('id', pageId.split(':').at(-1));
      }
    });
    const spaces = rootDoc.getMap('spaces') as YMap<YDoc>;
    spaces?.forEach((doc: YDoc, pageId: string) => {
      if (pageId.includes(':')) {
        const newPageId = pageId.split(':').at(-1) ?? pageId;
        const newDoc = new YDoc();
        // clone the original doc. yjs is not happy to use the same doc instance
        applyUpdate(newDoc, encodeStateAsUpdate(doc));
        newDoc.guid = doc.guid;
        spaces.set(newPageId, newDoc);
        // should remove the old doc, otherwise we will do it again in the next run
        spaces.delete(pageId);
        changed = true;
        console.debug(
          `fixed space id ${pageId} -> ${newPageId}, doc id: ${doc.guid}`
        );
      }
    });
  });
  return changed;
}
