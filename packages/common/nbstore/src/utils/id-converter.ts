import {
  applyUpdate,
  type Array as YArray,
  Doc as YDoc,
  type Map as YMap,
} from 'yjs';

type PromiseResult<T> = T extends Promise<infer R> ? R : never;
export type IdConverter = PromiseResult<ReturnType<typeof getIdConverter>>;

export async function getIdConverter(
  storage: {
    getDocBuffer: (id: string) => Promise<Uint8Array | null>;
  },
  spaceId: string
) {
  const oldIdToNewId = { [spaceId]: spaceId };
  const newIdToOldId = { [spaceId]: spaceId };

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
        oldIdToNewId[subdoc.guid] = pageId;
        newIdToOldId[pageId] = subdoc.guid;
      }
    }
  }

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
      return newIdToOldId[newId] ?? newId;
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
      return oldIdToNewId[oldId] ?? oldId;
    },
  };
}
