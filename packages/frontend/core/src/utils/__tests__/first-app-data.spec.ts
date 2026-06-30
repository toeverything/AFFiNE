import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const importDocsMock = vi.fn();
const loggerInfoMock = vi.fn();
const fetchMock = vi.fn();
const docsServiceToken = Symbol('DocsService');
const organizeServiceToken = Symbol('OrganizeService');
const workspaceSchemaMock = { version: 'test-schema' };

vi.mock('../../blocksuite/block-suite-editor', () => ({}));

vi.mock('@affine/debug', () => ({
  DebugLogger: class {
    info = loggerInfoMock;
  },
}));

vi.mock('@affine/env/constant', () => ({
  DEFAULT_WORKSPACE_NAME: 'AFFiNE',
}));

vi.mock('@affine/templates/onboarding.zip', () => ({
  default: 'mock-onboarding.zip',
}));

vi.mock('@blocksuite/affine/widgets/linked-doc', () => ({
  ZipTransformer: {
    importDocs: importDocsMock,
  },
}));

vi.mock('../../modules/doc', () => ({
  DocsService: docsServiceToken,
}));

vi.mock('../../modules/organize', () => ({
  OrganizeService: organizeServiceToken,
}));

vi.mock('../../modules/workspace', () => ({
  getAFFiNEWorkspaceSchema: () => workspaceSchemaMock,
}));

function createLocalStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));

  return {
    clear: vi.fn(() => {
      store.clear();
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    get length() {
      return store.size;
    },
  } satisfies Storage;
}

async function loadModule() {
  vi.resetModules();
  return await import('../first-app-data');
}

beforeEach(() => {
  importDocsMock.mockReset();
  loggerInfoMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    blob: vi.fn(async () => new Blob(['onboarding'])),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

test('ensureDefaultLocalWorkspace rebuilds the showcase workspace when no local workspace exists', async () => {
  const localStorage = createLocalStorage({ 'is-first-open': 'false' });
  vi.stubGlobal('localStorage', localStorage);
  // The unconditional rebuild fallback only applies to native, where an empty
  // workspace list must never be surfaced to the user.
  vi.stubGlobal('BUILD_CONFIG', { ...globalThis.BUILD_CONFIG, isNative: true });

  const gettingStartedDoc = {
    id: 'getting-started-doc',
    ['title$']: { value: 'Getting Started with AFFiNE' },
  };
  const folderTutorialDoc = {
    id: 'folder-tutorial-doc',
    ['title$']: { value: 'How to use folder and Tags effectively' },
  };
  const docsService = {
    list: {
      ['docs$']: {
        value: [gettingStartedDoc, folderTutorialDoc],
      },
    },
  };
  const firstFolderNode = {
    createLink: vi.fn(),
    indexAt: vi.fn(() => 'folder-link-index'),
  };
  const rootFolder = {
    createFolder: vi.fn(() => 'first-folder-id'),
    indexAt: vi.fn(() => 'folder-index'),
  };
  const organizeService = {
    folderTree: {
      rootFolder,
      ['folderNode$']: vi.fn(() => ({ value: firstFolderNode })),
    },
  };
  const waitForDocReady = vi.fn(async () => {});
  const dispose = vi.fn();
  const meta = { id: 'workspace-1', flavour: 'local' };
  const metadataMapSet = vi.fn();
  const metadataMap = { set: metadataMapSet };
  const docCollection = {
    meta: {
      initialize: vi.fn(),
    },
    doc: {
      getMap: vi.fn(() => metadataMap),
    },
  };

  const workspacesService = {
    create: vi.fn(
      async (
        _flavour: string,
        initializer: (docCollection: unknown) => Promise<void>
      ) => {
        await initializer(docCollection as never);
        return meta;
      }
    ),
    list: {
      waitForRevalidation: vi.fn(async () => {}),
      ['workspaces$']: {
        value: [],
      },
    },
    open: vi.fn(() => ({
      workspace: {
        id: meta.id,
        engine: {
          doc: {
            waitForDocReady,
          },
        },
        scope: {
          get: (token: unknown) => {
            if (token === docsServiceToken) {
              return docsService;
            }
            if (token === organizeServiceToken) {
              return organizeService;
            }
            throw new Error(`Unexpected service token: ${String(token)}`);
          },
        },
      },
      dispose,
    })),
  };

  const { ensureDefaultLocalWorkspace } = await loadModule();

  await expect(
    ensureDefaultLocalWorkspace(workspacesService as never)
  ).resolves.toEqual({
    meta,
    defaultPageId: 'getting-started-doc',
  });

  expect(workspacesService.list.waitForRevalidation).toHaveBeenCalledTimes(1);
  expect(workspacesService.create).toHaveBeenCalledWith(
    'local',
    expect.any(Function)
  );
  expect(docCollection.meta.initialize).toHaveBeenCalledTimes(1);
  expect(docCollection.doc.getMap).toHaveBeenCalledWith('meta');
  expect(metadataMapSet).toHaveBeenCalledWith('name', 'AFFiNE');
  expect(fetchMock).toHaveBeenCalledWith('mock-onboarding.zip');
  expect(importDocsMock).toHaveBeenCalledWith(
    docCollection,
    workspaceSchemaMock,
    expect.any(Blob)
  );
  expect(rootFolder.createFolder).toHaveBeenCalledWith(
    'First Folder',
    'folder-index'
  );
  expect(firstFolderNode.createLink).toHaveBeenCalledWith(
    'doc',
    'folder-tutorial-doc',
    'folder-link-index'
  );
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(localStorage.setItem).not.toHaveBeenCalled();
});

test('ensureDefaultLocalWorkspace does not recreate a workspace on web after the last one is deleted', async () => {
  const localStorage = createLocalStorage({ 'is-first-open': 'false' });
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('BUILD_CONFIG', {
    ...globalThis.BUILD_CONFIG,
    isNative: false,
  });

  const create = vi.fn();
  const workspacesService = {
    create,
    list: {
      waitForRevalidation: vi.fn(async () => {}),
      ['workspaces$']: {
        value: [],
      },
    },
  };

  const { ensureDefaultLocalWorkspace } = await loadModule();

  await expect(
    ensureDefaultLocalWorkspace(workspacesService as never)
  ).resolves.toBeUndefined();
  expect(create).not.toHaveBeenCalled();
});
