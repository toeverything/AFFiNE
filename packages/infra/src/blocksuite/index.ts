import type { PageMeta, Workspace } from '@blocksuite/store';
import { createIndexeddbStorage } from '@blocksuite/store';
import type { createStore, WritableAtom } from 'jotai/vanilla';

export async function buildShowcaseWorkspace(
  workspace: Workspace,
  options: {
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
  const showcaseWorkspaceVersions = {
    'affine:code': 1,
    'affine:paragraph': 1,
    'affine:page': 2,
    'affine:list': 1,
    'affine:note': 1,
    'affine:divider': 1,
    'affine:image': 1,
    'affine:surface': 3,
    'affine:bookmark': 1,
    'affine:database': 2,
  };
  workspace.doc.getMap('meta').set('blockVersions', showcaseWorkspaceVersions);
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
  const { store, atoms } = options;
  ['F1SX6cgNxy', 'nQd2Bdvoqz', 'j8hIA_C0QF'].forEach(pageId => {
    store.set(atoms.pageMode, pageId, 'edgeless');
  });

  const pageMetas = {
    'gc5FeppNDv-hello-world': {
      createDate: 1691548231530,
      tags: ['ZHBa2NtdSo', 'QYFD_HeQc-', 'wg-fBtd2eI'],
      updatedDate: 1691676331623,
      favorite: true,
      jumpOnce: true,
    },
    F1SX6cgNxy: {
      createDate: 1691548220794,
      tags: [],
      updatedDate: 1691676775642,
      favorite: false,
    },
    '3R9X-gMh3m': {
      createDate: 1691551731225,
      tags: [],
      updatedDate: 1691654611175,
      favorite: false,
    },
    z_v6LOqNpp: {
      createDate: 1691552082822,
      tags: [],
      updatedDate: 1691654606912,
      favorite: false,
    },
    '0N0WzwmtK_': {
      createDate: 1691552090989,
      tags: [],
      updatedDate: 1691646748171,
      favorite: false,
    },
    '6gexHy-jto': {
      createDate: 1691564303138,
      tags: [],
      updatedDate: 1691646845195,
    },
    nQd2Bdvoqz: {
      createDate: 1691574743531,
      tags: ['icg1n5UdkP'],
      updatedDate: 1691647117761,
    },
    bj_cuI1tN7: {
      createDate: 1691574859042,
      tags: [],
      updatedDate: 1691648159371,
    },
    fFoDX2J1Z5: {
      createDate: 1691575011078,
      tags: ['8qcYPCTK0h'],
      updatedDate: 1691645074511,
      favorite: false,
    },
    PqZ7MLlL_9: {
      createDate: 1691634722239,
      tags: ['ze07JVwBu4'],
      updatedDate: 1691647069662,
      favorite: false,
    },
    A4wBRdQZN0: {
      createDate: 1691635388447,
      tags: ['Oe5dSe1DDJ'],
      updatedDate: 1691645873930,
    },
    kBB4lzhm7C: {
      createDate: 1691636192263,
      tags: ['q3mceOl_zi', 'g1L5dXKctL'],
      updatedDate: 1691645102104,
    },
    j8hIA_C0QF: {
      createDate: 1691574743531,
      tags: ['icg1n5UdkP'],
      updatedDate: 1691574743531,
    },
  } satisfies Record<string, Partial<PageMeta>>;
  const data = [
    [
      'gc5FeppNDv-hello-world',
      import('@affine/templates/v1/getting-started.json'),
    ],
    ['F1SX6cgNxy', import('@affine/templates/v1/preloading.json')],
    ['3R9X-gMh3m', import('@affine/templates/v1/template-galleries.json')],
    ['z_v6LOqNpp', import('@affine/templates/v1/personal-home.json')],
    ['0N0WzwmtK_', import('@affine/templates/v1/working-home.json')],
    [
      '6gexHy-jto',
      import('@affine/templates/v1/personal-project-management.json'),
    ],
    ['nQd2Bdvoqz', import('@affine/templates/v1/travel-plan.json')],
    [
      'bj_cuI1tN7',
      import('@affine/templates/v1/personal-knowledge-management.json'),
    ],
    [
      'fFoDX2J1Z5',
      import('@affine/templates/v1/annual-performance-review.json'),
    ],
    ['PqZ7MLlL_9', import('@affine/templates/v1/brief-event-planning.json')],
    ['A4wBRdQZN0', import('@affine/templates/v1/meeting-summary.json')],
    ['kBB4lzhm7C', import('@affine/templates/v1/okr-template.json')],
    ['j8hIA_C0QF', import('@affine/templates/v1/travel-note.json')],
  ] as const;
  await Promise.all(
    data.map(async ([id, promise]) => {
      const { default: template } = await promise;
      await workspace.importPageSnapshot(template, id);
      workspace.setPageMeta(id, pageMetas[id]);
    })
  );
}

import { applyUpdate, encodeStateAsUpdate } from 'yjs';

const migrationOrigin = 'affine-migration';

import type { Schema } from '@blocksuite/store';
import { Array as YArray, Doc as YDoc, Map as YMap } from 'yjs';

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

function migrateMeta(oldDoc: YDoc, newDoc: YDoc) {
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
        map.set(key, value);
      });
    return map;
  });
  pages.push(mapList);
}

function migrateBlocks(oldDoc: YDoc, newDoc: YDoc) {
  const spaces = newDoc.getMap('spaces');
  const originalMeta = oldDoc.getMap('space:meta');
  const originalVersions = originalMeta.get('versions') as YMap<number>;
  const originalPages = originalMeta.get('pages') as YArray<YMap<unknown>>;
  originalPages.forEach(page => {
    const id = page.get('id') as string;
    const spaceId = id.startsWith('space:') ? id : `space:${id}`;
    const originalBlocks = oldDoc.getMap(spaceId) as YMap<unknown>;
    const subdoc = new YDoc();
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

export function migrateToSubdoc(oldDoc: YDoc): YDoc {
  const needMigration =
    Array.from(oldDoc.getMap('space:meta').keys()).length > 0;
  if (!needMigration) {
    return oldDoc;
  }
  const newDoc = new YDoc();
  migrateMeta(oldDoc, newDoc);
  migrateBlocks(oldDoc, newDoc);
  return newDoc;
}

export async function migrateDatabaseBlockTo3(rootDoc: YDoc, schema: Schema) {
  const spaces = rootDoc.getMap('spaces') as YMap<any>;
  spaces.forEach(space => {
    schema.upgradePage(
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
  const meta = rootDoc.getMap('meta') as YMap<unknown>;
  const versions = meta.get('blockVersions') as YMap<number>;
  versions.set('affine:database', 3);
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

const upgradeV2ToV3 = async (options: UpgradeOptions): Promise<boolean> => {
  const rootDoc = await options.getCurrentRootDoc();
  const spaces = rootDoc.getMap('spaces') as YMap<any>;
  const meta = rootDoc.getMap('meta') as YMap<unknown>;
  const versions = meta.get('blockVersions') as YMap<number>;
  if (versions.get('affine:database') === 3) {
    return false;
  }
  const schema = options.getSchema();
  spaces.forEach(space => {
    schema.upgradePage(
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
  versions.set('affine:database', 3);
  return true;
};

export enum WorkspaceVersion {
  // v1 is treated as undefined
  SubDoc = 2,
  DatabaseV3 = 3,
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
