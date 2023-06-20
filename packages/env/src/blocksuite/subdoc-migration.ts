import * as Y from 'yjs';

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
