import { YOctoDocSession } from '@toeverything/infra/y-octo-session';

export type IdConverter = ReturnType<typeof createIdConverter>;

export function extractSpaceSubdocMappings(
  spaceId: string,
  rootDocBuffer: Uint8Array
): Array<{ pageId: string; subdocGuid: string }> {
  const doc = new YOctoDocSession({
    guid: spaceId,
    undo: 'disabled',
  });
  try {
    doc.applyUpdateV1(rootDocBuffer);
    const pagesVal = doc.getMapValue({ Identity: { Root: 'meta' } }, 'pages');
    if (!pagesVal || !('Array' in pagesVal)) {
      return [];
    }
    const items = doc.readArray({ Identity: pagesVal.Array });
    const mappings: Array<{ pageId: string; subdocGuid: string }> = [];
    for (const item of items) {
      if (!('Map' in item)) {
        continue;
      }
      const idVal = doc.getMapValue({ Identity: item.Map }, 'id');
      const pageId =
        idVal && 'Any' in idVal && typeof idVal.Any === 'string'
          ? idVal.Any
          : null;
      if (!pageId) {
        continue;
      }
      const subdocVal = doc.getMapValue(
        { Identity: { Root: 'spaces' } },
        pageId
      );
      if (subdocVal && 'Doc' in subdocVal && subdocVal.Doc.guid) {
        mappings.push({ pageId, subdocGuid: subdocVal.Doc.guid });
      }
    }
    return mappings;
  } finally {
    doc.destroy();
  }
}

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
    for (const { pageId, subdocGuid } of extractSpaceSubdocMappings(
      spaceId,
      rootDocBuffer
    )) {
      oldIdToNewId.set(subdocGuid, pageId);
      newIdToOldId.set(pageId, subdocGuid);
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
