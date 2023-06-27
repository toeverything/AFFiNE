import * as Y from 'yjs';

function migrateDatabase(data: Y.Map<unknown>) {
  data.delete('prop:mode');
  data.set('prop:views', new Y.Array());
  const columns = (data.get('prop:columns') as Y.Array<unknown>).toJSON() as {
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
  const cells = (data.get('prop:cells') as Y.Map<unknown>).toJSON() as Record<
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
      update(row[id]);
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
  data: Y.Map<unknown>,
  version: number
) {
  if (flavour === 'affine:frame') {
    data.set('sys:flavour', 'affine:note');
    return;
  }
  if (flavour === 'affine:surface' && version <= 3 && data.has('elements')) {
    const elements = data.get('elements') as Y.Map<unknown>;
    data.set('prop:elements', elements.clone());
    data.delete('elements');
  }
  if (flavour === 'affine:embed') {
    data.set('sys:flavour', 'affine:image');
    data.delete('prop:type');
  }
  if (flavour === 'affine:database' && version < 2) {
    migrateDatabase(data);
  }
}

function updateBlockVersions(versions: Y.Map<number>) {
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

function migrateMeta(oldDoc: Y.Doc, newDoc: Y.Doc) {
  const originalMeta = oldDoc.getMap('space:meta');
  const originalVersions = originalMeta.get('versions') as Y.Map<number>;
  const originalPages = originalMeta.get('pages') as Y.Array<Y.Map<unknown>>;
  const meta = newDoc.getMap('meta');
  const pages = new Y.Array();
  const blockVersions = originalVersions.clone();

  meta.set('workspaceVersion', 1);
  meta.set('blockVersions', blockVersions);
  meta.set('pages', pages);
  meta.set('name', originalMeta.get('name') as string);

  updateBlockVersions(blockVersions);
  const mapList = originalPages.map(page => {
    const map = new Y.Map();
    Array.from(page.entries())
      .filter(([key]) => key !== 'subpageIds')
      .forEach(([key, value]) => {
        map.set(key, value);
      });
    return map;
  });
  pages.push(mapList);
}

function migrateBlocks(oldDoc: Y.Doc, newDoc: Y.Doc) {
  const spaces = newDoc.getMap('spaces');
  const originalMeta = oldDoc.getMap('space:meta');
  const originalVersions = originalMeta.get('versions') as Y.Map<number>;
  const originalPages = originalMeta.get('pages') as Y.Array<Y.Map<unknown>>;
  originalPages.forEach(page => {
    const id = page.get('id') as string;
    const spaceId = id.startsWith('space:') ? id : `space:${id}`;
    const originalBlocks = oldDoc.getMap(spaceId) as Y.Map<unknown>;
    const subdoc = new Y.Doc();
    spaces.set(spaceId, subdoc);
    const blocks = subdoc.getMap('blocks');
    Array.from(originalBlocks.entries()).forEach(([key, value]) => {
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

export function migrateToSubdoc(doc: Y.Doc): Y.Doc {
  const needMigration = Array.from(doc.getMap('space:meta').keys()).length > 0;
  if (!needMigration) {
    return doc;
  }
  const output = new Y.Doc();
  migrateMeta(doc, output);
  migrateBlocks(doc, output);
  return output;
}
