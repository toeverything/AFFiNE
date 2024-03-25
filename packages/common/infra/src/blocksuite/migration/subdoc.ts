import { nanoid } from 'nanoid';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

const migrationOrigin = 'affine-migration';

type XYWH = [number, number, number, number];

function deserializeXYWH(xywh: string): XYWH {
  return JSON.parse(xywh) as XYWH;
}

function migrateDatabase(data: YMap<unknown>) {
  data.delete('prop:mode');
  data.set('prop:views', new YArray());
  const columns = (data.get('prop:columns') as YArray<unknown>).toJSON() as {
    id: string;
    name: string;
    hide: boolean;
    type: string;
    width: number;
    selection?: unknown[];
  }[];
  const views = [
    {
      id: 'default',
      name: 'Table',
      columns: columns.map(col => ({
        id: col.id,
        width: col.width,
        hide: col.hide,
      })),
      filter: { type: 'group', op: 'and', conditions: [] },
      mode: 'table',
    },
  ];
  const cells = (data.get('prop:cells') as YMap<unknown>).toJSON() as Record<
    string,
    Record<
      string,
      {
        id: string;
        value: unknown;
      }
    >
  >;
  const convertColumn = (
    id: string,
    update: (cell: { id: string; value: unknown }) => void
  ) => {
    Object.values(cells).forEach(row => {
      if (row[id] !== null && row[id] !== undefined) {
        update(row[id]);
      }
    });
  };
  const newColumns = columns.map(v => {
    let data: Record<string, unknown> = {};
    if (v.type === 'select' || v.type === 'multi-select') {
      data = { options: v.selection };
      if (v.type === 'select') {
        convertColumn(v.id, cell => {
          if (Array.isArray(cell.value)) {
            cell.value = cell.value[0]?.id;
          }
        });
      } else {
        convertColumn(v.id, cell => {
          if (Array.isArray(cell.value)) {
            cell.value = cell.value.map(v => v.id);
          }
        });
      }
    }
    if (v.type === 'number') {
      convertColumn(v.id, cell => {
        if (typeof cell.value === 'string') {
          cell.value = Number.parseFloat(cell.value.toString());
        }
      });
    }
    return {
      id: v.id,
      type: v.type,
      name: v.name,
      data,
    };
  });
  data.set('prop:columns', newColumns);
  data.set('prop:views', views);
  data.set('prop:cells', cells);
}

function runBlockMigration(
  flavour: string,
  data: YMap<unknown>,
  version: number
) {
  if (flavour === 'affine:frame') {
    data.set('sys:flavour', 'affine:note');
    return;
  }
  if (flavour === 'affine:surface' && version <= 3) {
    if (data.has('elements')) {
      const elements = data.get('elements') as YMap<unknown>;
      migrateSurface(elements);
      data.set('prop:elements', elements.clone());
      data.delete('elements');
    } else {
      data.set('prop:elements', new YMap());
    }
  }
  if (flavour === 'affine:embed') {
    data.set('sys:flavour', 'affine:image');
    data.delete('prop:type');
  }
  if (flavour === 'affine:database' && version < 2) {
    migrateDatabase(data);
  }
}

function migrateSurface(data: YMap<unknown>) {
  for (const [, value] of <IterableIterator<[string, YMap<unknown>]>>(
    data.entries()
  )) {
    if (value.get('type') === 'connector') {
      migrateSurfaceConnector(value);
    }
  }
}

function migrateSurfaceConnector(data: YMap<any>) {
  let id = data.get('startElement')?.id;
  const controllers = data.get('controllers');
  const length = controllers.length;
  const xywh = deserializeXYWH(data.get('xywh'));
  if (id) {
    data.set('source', { id });
  } else {
    data.set('source', {
      position: [controllers[0].x + xywh[0], controllers[0].y + xywh[1]],
    });
  }

  id = data.get('endElement')?.id;
  if (id) {
    data.set('target', { id });
  } else {
    data.set('target', {
      position: [
        controllers[length - 1].x + xywh[0],
        controllers[length - 1].y + xywh[1],
      ],
    });
  }

  const width = data.get('lineWidth') ?? 4;
  data.set('strokeWidth', width);
  const color = data.get('color');
  data.set('stroke', color);

  data.delete('startElement');
  data.delete('endElement');
  data.delete('controllers');
  data.delete('lineWidth');
  data.delete('color');
  data.delete('xywh');
}

function updateBlockVersions(versions: YMap<number>) {
  const frameVersion = versions.get('affine:frame');
  if (frameVersion !== undefined) {
    versions.set('affine:note', frameVersion);
    versions.delete('affine:frame');
  }
  const embedVersion = versions.get('affine:embed');
  if (embedVersion !== undefined) {
    versions.set('affine:image', embedVersion);
    versions.delete('affine:embed');
  }
  const databaseVersion = versions.get('affine:database');
  if (databaseVersion !== undefined && databaseVersion < 2) {
    versions.set('affine:database', 2);
  }
}

function migrateMeta(
  oldDoc: YDoc,
  newDoc: YDoc,
  idMap: Record<string, string>
) {
  const originalMeta = oldDoc.getMap('space:meta');
  const originalVersions = originalMeta.get('versions') as YMap<number>;
  const originalPages = originalMeta.get('pages') as YArray<YMap<string>>;
  const meta = newDoc.getMap('meta');
  const pages = new YArray();
  const blockVersions = originalVersions.clone();

  meta.set('workspaceVersion', 1);
  meta.set('blockVersions', blockVersions);
  meta.set('pages', pages);
  meta.set('name', originalMeta.get('name') as string);

  updateBlockVersions(blockVersions);
  const mapList = originalPages.map(page => {
    const map = new YMap();
    Array.from(page.entries())
      .filter(([key]) => key !== 'subpageIds')
      .forEach(([key, value]) => {
        if (key === 'id') {
          idMap[value] = nanoid();
          map.set(key, idMap[value]);
        } else {
          map.set(key, value);
        }
      });
    return map;
  });
  pages.push(mapList);
}

function migrateBlocks(
  oldDoc: YDoc,
  newDoc: YDoc,
  idMap: Record<string, string>
) {
  const spaces = newDoc.getMap('spaces');
  const originalMeta = oldDoc.getMap('space:meta');
  const originalVersions = originalMeta.get('versions') as YMap<number>;
  const originalPages = originalMeta.get('pages') as YArray<YMap<unknown>>;
  originalPages.forEach(page => {
    const id = page.get('id') as string;
    const newId = idMap[id];
    const spaceId = id.startsWith('space:') ? id : `space:${id}`;
    const originalBlocks = oldDoc.getMap(spaceId) as YMap<unknown>;
    const subdoc = new YDoc();
    spaces.set(newId, subdoc);
    subdoc.guid = id;
    const blocks = subdoc.getMap('blocks');
    Array.from(originalBlocks.entries()).forEach(([key, value]) => {
      // @ts-expect-error clone method exists
      const blockData = value.clone();
      blocks.set(key, blockData);
      const flavour = blockData.get('sys:flavour') as string;
      const version = originalVersions.get(flavour);
      if (version !== undefined) {
        runBlockMigration(flavour, blockData, version);
      }
    });
  });
}

export function migrateToSubdoc(oldDoc: YDoc): YDoc {
  const needMigration =
    Array.from(oldDoc.getMap('space:meta').keys()).length > 0;
  if (!needMigration) {
    return oldDoc;
  }
  const newDoc = new YDoc();
  const idMap = {} as Record<string, string>;
  migrateMeta(oldDoc, newDoc, idMap);
  migrateBlocks(oldDoc, newDoc, idMap);
  return newDoc;
}

/**
 * upgrade oldDoc to v2, write to targetDoc
 */
export const upgradeV1ToV2 = async (oldDoc: YDoc, targetDoc: YDoc) => {
  const newDoc = migrateToSubdoc(oldDoc);
  applyUpdate(targetDoc, encodeStateAsUpdate(newDoc), migrationOrigin);
  newDoc.getSubdocs().forEach(subdoc => {
    targetDoc.getSubdocs().forEach(newDoc => {
      if (subdoc.guid === newDoc.guid) {
        applyUpdate(newDoc, encodeStateAsUpdate(subdoc), migrationOrigin);
      }
    });
  });
};
