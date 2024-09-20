import type { Schema } from '@blocksuite/affine/store';
import type { Array as YArray } from 'yjs';
import {
  applyUpdate,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
  transact,
} from 'yjs';

export const getLatestVersions = (schema: Schema): Record<string, number> => {
  return [...schema.flavourSchemaMap.entries()].reduce(
    (record, [flavour, schema]) => {
      record[flavour] = schema.version;
      return record;
    },
    {} as Record<string, number>
  );
};

export async function migratePages(
  rootDoc: YDoc,
  schema: Schema
): Promise<boolean> {
  const spaces = rootDoc.getMap('spaces') as YMap<any>;
  const meta = rootDoc.getMap('meta') as YMap<unknown>;
  const versions = meta.get('blockVersions') as YMap<number>;
  const oldVersions = versions?.toJSON() ?? {};

  spaces.forEach((space: YDoc) => {
    try {
      // Catch page upgrade error to avoid blocking the whole workspace migration.
      schema.upgradeDoc(0, oldVersions, space);
    } catch (e) {
      console.error(e);
    }
  });
  schema.upgradeCollection(rootDoc);

  // Hard code to upgrade page version to 2.
  // Let e2e to ensure the data version is correct.
  return transact(
    rootDoc,
    () => {
      const pageVersion = meta.get('pageVersion');
      if (typeof pageVersion !== 'number' || pageVersion < 2) {
        meta.set('pageVersion', 2);
      }

      const newVersions = getLatestVersions(schema);
      meta.set('blockVersions', new YMap(Object.entries(newVersions)));
      return Object.entries(oldVersions).some(
        ([flavour, version]) => newVersions[flavour] !== version
      );
    },
    'migratePages',
    /**
     * transact as remote update, because blocksuite will skip local changes.
     * https://github.com/toeverything/blocksuite/blob/9c2df3f7aa5617c050e0dccdd73e99bb67e0c0f7/packages/store/src/reactive/utils.ts#L143
     */
    false
  );
}

// patch root doc's space guid compatibility issue
//
// in version 0.10, page id in spaces no longer has prefix "space:"
// The data flow for fetching a doc's updates is:
// - page id in `meta.pages` -> find `${page-id}` in `doc.spaces` -> `doc` -> `doc.guid`
// if `doc` is not found in `doc.spaces`, a new doc will be created and its `doc.guid` is the same with its pageId
// - because of guid logic change, the doc that previously prefixed with "space:" will not be found in `doc.spaces`
// - when fetching the rows of this doc using the doc id === page id,
//   it will return empty since there is no updates associated with the page id
export function migrateGuidCompatibility(rootDoc: YDoc) {
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
      console.debug(
        `fixed space id ${pageId} -> ${newPageId}, doc id: ${doc.guid}`
      );
    }
  });
}
