import {
  applyUpdate,
  type Array as YArray,
  Doc as YDoc,
  type Map as YMap,
} from 'yjs';

export type IdConverter = ReturnType<typeof createIdConverter>;

export async function getIdConverter(
  storage: {
    getDocBuffer: (id: string) => Promise<Uint8Array | null>;
  },
  spaceId: string
) {
  const oldIdToNewId = new Map([[spaceId, spaceId]]);
  const newIdToOldId = new Map([[spaceId, spaceId]]);

  const rootDocBuffer = await storage.getDocBuffer(spaceId);
  if (rootDocBuffer) {
    const ydoc = new YDoc({
      guid: spaceId,
    });
    applyUpdate(ydoc, rootDocBuffer);

    // get all ids from rootDoc.meta.pages.[*].id, trust this id as normalized id
    const normalizedDocIds = (
      (ydoc.getMap('meta') as YMap<any> | undefined)?.get('pages') as
        | YArray<YMap<any>>
        | undefined
    )
      ?.map(i => i.get('id') as string)
      .filter(i => !!i);

    const spaces = ydoc.getMap('spaces') as YMap<any> | undefined;
    for (const pageId of normalizedDocIds ?? []) {
      const subdoc = spaces?.get(pageId);
      if (subdoc && subdoc instanceof YDoc) {
        oldIdToNewId.set(subdoc.guid, pageId);
        newIdToOldId.set(pageId, subdoc.guid);
      }
    }
  }

  return createIdConverter(spaceId, oldIdToNewId, newIdToOldId);
}

export function createIdConverter(
  spaceId: string,
  oldIds: ReadonlyMap<string, string> = new Map(),
  newIds: ReadonlyMap<string, string> = new Map()
) {
  return {
    newIdToOldId(newId: string) {
      if (newId.startsWith(`db$`)) {
        // db$docId -> db$${spaceId}$docId
        return newId.replace(`db$`, `db$${spaceId}$`);
      }
      if (newId.startsWith(`userdata$`)) {
        // userdata$userId$docId -> userdata$userId$spaceId$docId
        return newId.replace(
          new RegExp(`^(userdata\\$[\\w-]+)\\$([^\\$]+)`),
          (_, p1, p2) => `${p1}$${spaceId}$${p2}`
        );
      }
      return newIds.get(newId) ?? newId;
    },
    oldIdToNewId(oldId: string) {
      // db$${spaceId}$docId -> db$docId
      if (oldId.startsWith(`db$${spaceId}$`)) {
        return oldId.replace(`db$${spaceId}$`, `db$`);
      }
      // userdata$userId$spaceId$docId -> userdata$userId$docId
      if (oldId.match(new RegExp(`^userdata\\$[\\w-]+\\$${spaceId}\\$`))) {
        return oldId.replace(`$${spaceId}$`, '$');
      }
      return oldIds.get(oldId) ?? oldId;
    },
  };
}
