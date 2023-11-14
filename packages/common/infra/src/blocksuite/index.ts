import type { Page, PageMeta, Workspace } from '@blocksuite/store';
import { createIndexeddbStorage } from '@blocksuite/store';
import type { createStore, WritableAtom } from 'jotai/vanilla';
import type { Doc } from 'yjs';
import { Array as YArray, Doc as YDoc, Map as YMap, transact } from 'yjs';

export async function initEmptyPage(page: Page, title?: string) {
  await page.waitForLoaded();
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(title ?? ''),
  });
  page.addBlock('affine:surface', {}, pageBlockId);
  const noteBlockId = page.addBlock('affine:note', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, noteBlockId);
}

export async function buildEmptyBlockSuite(workspace: Workspace) {
  const page = workspace.createPage();
  await initEmptyPage(page);
  workspace.setPageMeta(page.id, {
    jumpOnce: true,
  });
}

export async function buildShowcaseWorkspace(
  workspace: Workspace,
  options: {
    schema: Schema;
    atoms: {
      pageMode: WritableAtom<
        undefined,
        [pageId: string, mode: 'page' | 'edgeless'],
        void
      >;
    };
    store: ReturnType<typeof createStore>;
  }
) {
  const prototypes = {
    tags: {
      options: [
        {
          id: 'icg1n5UdkP',
          value: 'Travel',
          color: 'var(--affine-tag-gray)',
        },
        {
          id: 'Oe5dSe1DDJ',
          value: 'Quick summary',
          color: 'var(--affine-tag-green)',
        },
        {
          id: 'g1L5dXKctL',
          value: 'OKR',
          color: 'var(--affine-tag-purple)',
        },
        {
          id: 'q3mceOl_zi',
          value: 'Streamline your workflow',
          color: 'var(--affine-tag-teal)',
        },
        {
          id: 'ze07JVwBu4',
          value: 'Plan',
          color: 'var(--affine-tag-teal)',
        },
        {
          id: '8qcYPCTK0h',
          value: 'Review',
          color: 'var(--affine-tag-orange)',
        },
        {
          id: 'wg-fBtd2eI',
          value: 'Engage',
          color: 'var(--affine-tag-pink)',
        },
        {
          id: 'QYFD_HeQc-',
          value: 'Create',
          color: 'var(--affine-tag-blue)',
        },
        {
          id: 'ZHBa2NtdSo',
          value: 'Learn',
          color: 'var(--affine-tag-yellow)',
        },
      ],
    },
  };
  workspace.meta.setProperties(prototypes);
  const edgelessPage1 = nanoid();
  const edgelessPage2 = nanoid();
  const edgelessPage3 = nanoid();
  const { store, atoms } = options;
  [edgelessPage1, edgelessPage2, edgelessPage3].forEach(pageId => {
    store.set(atoms.pageMode, pageId, 'edgeless');
  });

  const pageMetas = {
    '9f6f3c04-cf32-470c-9648-479dc838f10e': {
      createDate: 1691548231530,
      tags: ['ZHBa2NtdSo', 'QYFD_HeQc-', 'wg-fBtd2eI'],
      updatedDate: 1691676331623,
      favorite: true,
      jumpOnce: true,
    },
    '0773e198-5de0-45d4-a35e-de22ea72b96b': {
      createDate: 1691548220794,
      tags: [],
      updatedDate: 1691676775642,
      favorite: false,
    },
    '59b140eb-4449-488f-9eeb-42412dcc044e': {
      createDate: 1691551731225,
      tags: [],
      updatedDate: 1691654611175,
      favorite: false,
    },
    '7217fbe2-61db-4a91-93c6-ad5c800e5a43': {
      createDate: 1691552082822,
      tags: [],
      updatedDate: 1691654606912,
      favorite: false,
    },
    '6eb43ea8-8c11-456d-bb1d-5193937961ab': {
      createDate: 1691552090989,
      tags: [],
      updatedDate: 1691646748171,
      favorite: false,
    },
    '3ddc8a4f-62c7-4fd4-8064-9ed9f61e437a': {
      createDate: 1691564303138,
      tags: [],
      updatedDate: 1691646845195,
    },
    '512b1cb3-d22d-4b20-a7aa-58e2afcb1238': {
      createDate: 1691574743531,
      tags: ['icg1n5UdkP'],
      updatedDate: 1691647117761,
    },
    '22163830-8252-43fe-b62d-fd9bbeaa4caa': {
      createDate: 1691574859042,
      tags: [],
      updatedDate: 1691648159371,
    },
    'b7a9e1bc-e205-44aa-8dad-7e328269d00b': {
      createDate: 1691575011078,
      tags: ['8qcYPCTK0h'],
      updatedDate: 1691645074511,
      favorite: false,
    },
    '646305d9-93e0-48df-bb92-d82944ceb5a3': {
      createDate: 1691634722239,
      tags: ['ze07JVwBu4'],
      updatedDate: 1691647069662,
      favorite: false,
    },
    '0350509d-8702-4797-b4d7-168f5e9359c7': {
      createDate: 1691635388447,
      tags: ['Oe5dSe1DDJ'],
      updatedDate: 1691645873930,
    },
    'aa02af3c-5c5c-4856-b7ce-947ad17331f3': {
      createDate: 1691636192263,
      tags: ['q3mceOl_zi', 'g1L5dXKctL'],
      updatedDate: 1691645102104,
    },
    '9d6e716e-a071-45a2-88ac-2f2f6eec0109': {
      createDate: 1691574743531,
      tags: ['icg1n5UdkP'],
      updatedDate: 1691574743531,
    },
  } satisfies Record<string, Partial<PageMeta>>;
  const data = [
    [
      '9f6f3c04-cf32-470c-9648-479dc838f10e',
      import('@affine/templates/v1/getting-started.json'),
      nanoid(),
    ],
    [
      '0773e198-5de0-45d4-a35e-de22ea72b96b',
      import('@affine/templates/v1/preloading.json'),
      edgelessPage1,
    ],
    [
      '59b140eb-4449-488f-9eeb-42412dcc044e',
      import('@affine/templates/v1/template-galleries.json'),
      nanoid(),
    ],
    [
      '7217fbe2-61db-4a91-93c6-ad5c800e5a43',
      import('@affine/templates/v1/personal-home.json'),
      nanoid(),
    ],
    [
      '6eb43ea8-8c11-456d-bb1d-5193937961ab',
      import('@affine/templates/v1/working-home.json'),
      nanoid(),
    ],
    [
      '3ddc8a4f-62c7-4fd4-8064-9ed9f61e437a',
      import('@affine/templates/v1/personal-project-management.json'),
      nanoid(),
    ],
    [
      '512b1cb3-d22d-4b20-a7aa-58e2afcb1238',
      import('@affine/templates/v1/travel-plan.json'),
      edgelessPage2,
    ],
    [
      '22163830-8252-43fe-b62d-fd9bbeaa4caa',
      import('@affine/templates/v1/personal-knowledge-management.json'),
      nanoid(),
    ],
    [
      'b7a9e1bc-e205-44aa-8dad-7e328269d00b',
      import('@affine/templates/v1/annual-performance-review.json'),
      nanoid(),
    ],
    [
      '646305d9-93e0-48df-bb92-d82944ceb5a3',
      import('@affine/templates/v1/brief-event-planning.json'),
      nanoid(),
    ],
    [
      '0350509d-8702-4797-b4d7-168f5e9359c7',
      import('@affine/templates/v1/meeting-summary.json'),
      nanoid(),
    ],
    [
      'aa02af3c-5c5c-4856-b7ce-947ad17331f3',
      import('@affine/templates/v1/okr-template.json'),
      nanoid(),
    ],
    [
      '9d6e716e-a071-45a2-88ac-2f2f6eec0109',
      import('@affine/templates/v1/travel-note.json'),
      edgelessPage3,
    ],
  ] as const;
  const idMap = await Promise.all(data).then(async data => {
    return data.reduce<Record<string, string>>(
      (record, currentValue) => {
        const [oldId, _, newId] = currentValue;
        record[oldId] = newId;
        return record;
      },
      {} as Record<string, string>
    );
  });
  await Promise.all(
    data.map(async ([id, promise, newId]) => {
      const { default: template } = await promise;
      let json = JSON.stringify(template);
      Object.entries(idMap).forEach(([oldId, newId]) => {
        json = json.replaceAll(oldId, newId);
      });
      json = JSON.parse(json);
      await workspace
        .importPageSnapshot(structuredClone(json), newId)
        .catch(error => {
          console.error('error importing page', id, error);
        });
      const page = workspace.getPage(newId);
      assertExists(page);
      await page.waitForLoaded();
      workspace.schema.upgradePage(
        0,
        {
          'affine:note': 1,
          'affine:bookmark': 1,
          'affine:database': 2,
          'affine:divider': 1,
          'affine:image': 1,
          'affine:list': 1,
          'affine:code': 1,
          'affine:page': 2,
          'affine:paragraph': 1,
          'affine:surface': 3,
        },
        page.spaceDoc
      );
    })
  );
  Object.entries(pageMetas).forEach(([oldId, meta]) => {
    const newId = idMap[oldId];
    workspace.setPageMeta(newId, meta);
  });
}

import { applyUpdate, encodeStateAsUpdate } from 'yjs';

const migrationOrigin = 'affine-migration';

import { assertExists } from '@blocksuite/global/utils';
import type { Schema } from '@blocksuite/store';
import { nanoid } from 'nanoid';

type XYWH = [number, number, number, number];

function deserializeXYWH(xywh: string): XYWH {
  return JSON.parse(xywh) as XYWH;
}

const getLatestVersions = (schema: Schema): Record<string, number> => {
  return [...schema.flavourSchemaMap.entries()].reduce(
    (record, [flavour, schema]) => {
      record[flavour] = schema.version;
      return record;
    },
    {} as Record<string, number>
  );
};

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
      if (row[id] != null) {
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
  const originalPages = originalMeta.get('pages') as YArray<YMap<unknown>>;
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

export type UpgradeOptions = {
  getCurrentRootDoc: () => Promise<YDoc>;
  createWorkspace: () => Promise<Workspace>;
  getSchema: () => Schema;
};

const upgradeV1ToV2 = async (options: UpgradeOptions) => {
  const oldDoc = await options.getCurrentRootDoc();
  const newDoc = migrateToSubdoc(oldDoc);
  const newWorkspace = await options.createWorkspace();
  applyUpdate(newWorkspace.doc, encodeStateAsUpdate(newDoc), migrationOrigin);
  newDoc.getSubdocs().forEach(subdoc => {
    newWorkspace.doc.getSubdocs().forEach(newDoc => {
      if (subdoc.guid === newDoc.guid) {
        applyUpdate(newDoc, encodeStateAsUpdate(subdoc), migrationOrigin);
      }
    });
  });
  return newWorkspace;
};

/**
 * Force upgrade block schema to the latest.
 * Don't force to upgrade the pages without the check.
 *
 * Please note that this function will not upgrade the workspace version.
 *
 * @returns true if any schema is upgraded.
 * @returns false if no schema is upgraded.
 */
export async function forceUpgradePages(
  options: Omit<UpgradeOptions, 'createWorkspace'>
): Promise<boolean> {
  const rootDoc = await options.getCurrentRootDoc();
  guidCompatibilityFix(rootDoc);

  const spaces = rootDoc.getMap('spaces') as YMap<any>;
  const meta = rootDoc.getMap('meta') as YMap<unknown>;
  const versions = meta.get('blockVersions') as YMap<number>;
  const schema = options.getSchema();
  const oldVersions = versions?.toJSON() ?? {};
  spaces.forEach((space: Doc) => {
    try {
      schema.upgradePage(0, oldVersions, space);
    } catch (e) {
      console.error(`page ${space.guid} upgrade failed`, e);
    }
  });
  const newVersions = getLatestVersions(schema);
  meta.set('blockVersions', new YMap(Object.entries(newVersions)));
  return Object.entries(oldVersions).some(
    ([flavour, version]) => newVersions[flavour] !== version
  );
}

// database from 2 to 3
async function upgradeV2ToV3(options: UpgradeOptions): Promise<boolean> {
  const rootDoc = await options.getCurrentRootDoc();
  const spaces = rootDoc.getMap('spaces') as YMap<any>;
  const meta = rootDoc.getMap('meta') as YMap<unknown>;
  const versions = meta.get('blockVersions') as YMap<number>;
  const schema = options.getSchema();
  guidCompatibilityFix(rootDoc);
  spaces.forEach((space: Doc) => {
    schema.upgradePage(
      0,
      {
        'affine:note': 1,
        'affine:bookmark': 1,
        'affine:database': 2,
        'affine:divider': 1,
        'affine:image': 1,
        'affine:list': 1,
        'affine:code': 1,
        'affine:page': 2,
        'affine:paragraph': 1,
        'affine:surface': 3,
      },
      space
    );
  });
  if ('affine:database' in versions) {
    meta.set(
      'blockVersions',
      new YMap(Object.entries(getLatestVersions(schema)))
    );
  } else {
    Object.entries(getLatestVersions(schema)).map(([flavour, version]) =>
      versions.set(flavour, version)
    );
  }
  return true;
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
export function guidCompatibilityFix(rootDoc: YDoc) {
  let changed = false;
  transact(rootDoc, () => {
    const spaces = rootDoc.getMap('spaces') as YMap<YDoc>;
    spaces.forEach((doc: YDoc, pageId: string) => {
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

export enum WorkspaceVersion {
  // v1 is treated as undefined
  SubDoc = 2,
  DatabaseV3 = 3,
  Surface = 4,
}

/**
 * If returns false, it means no migration is needed.
 * If returns true, it means migration is done.
 * If returns Workspace, it means new workspace is created,
 *  and the old workspace should be deleted.
 */
export async function migrateWorkspace(
  currentVersion: WorkspaceVersion | undefined,
  options: UpgradeOptions
): Promise<Workspace | boolean> {
  if (currentVersion === undefined) {
    const workspace = await upgradeV1ToV2(options);
    await upgradeV2ToV3({
      ...options,
      getCurrentRootDoc: () => Promise.resolve(workspace.doc),
    });
    return workspace;
  }
  if (currentVersion === WorkspaceVersion.SubDoc) {
    return upgradeV2ToV3(options);
  } else if (currentVersion === WorkspaceVersion.DatabaseV3) {
    // surface from 3 to 5
    return forceUpgradePages(options);
  } else {
    return false;
  }
}

export async function migrateLocalBlobStorage(from: string, to: string) {
  const fromStorage = createIndexeddbStorage(from);
  const toStorage = createIndexeddbStorage(to);
  const keys = await fromStorage.crud.list();
  for (const key of keys) {
    const value = await fromStorage.crud.get(key);
    if (!value) {
      console.warn('cannot find blob:', key);
      continue;
    }
    await toStorage.crud.set(key, value);
  }
}
