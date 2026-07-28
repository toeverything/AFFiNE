/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const importDocs = vi.fn();
const docsServiceToken = Symbol('DocsService');
const organizeServiceToken = Symbol('OrganizeService');

vi.mock('../../blocksuite/block-suite-editor', () => ({}));
vi.mock('@blocksuite/affine/widgets/linked-doc', () => ({
  ZipTransformer: {
    importDocs,
  },
}));
vi.mock('@affine/templates/onboarding.zip', () => ({
  default: '/onboarding.zip',
}));
vi.mock('../../modules/doc', () => ({
  DocsService: docsServiceToken,
}));
vi.mock('../../modules/organize', () => ({
  OrganizeService: organizeServiceToken,
}));
vi.mock('../../modules/workspace', () => ({
  getAFFiNEWorkspaceSchema: () => 'schema',
}));

const originalBuildConfig = globalThis.BUILD_CONFIG;

beforeEach(() => {
  localStorage.clear();
  importDocs.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Blob()))
  );
  vi.stubGlobal('BUILD_CONFIG', {
    ...originalBuildConfig,
    isMobileEdition: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createWorkspacesService({
  existing = [],
  createWorkspace,
}: {
  existing?: Array<{ id: string; flavour: string }>;
  createWorkspace?: (
    flavour: string
  ) => Promise<{ id: string; flavour: string }>;
} = {}) {
  const workspaces = [...existing];
  const createMock = vi.fn(
    createWorkspace ??
      (async (flavour: string) => {
        const meta = { id: `workspace-${workspaces.length + 1}`, flavour };
        workspaces.push(meta);
        return meta;
      })
  );
  const waitForDocReady = vi.fn(async () => {});
  const create = vi.fn(
    async (
      flavour: string,
      setup: (docCollection: {
        meta: { initialize: () => void };
        doc: { getMap: () => { set: (key: string, value: string) => void } };
      }) => Promise<void>
    ) => {
      const meta = await createMock(flavour);
      await setup({
        meta: { initialize: vi.fn() },
        doc: {
          getMap: () => ({
            set: vi.fn(),
          }),
        },
      });
      return meta;
    }
  );
  const service = {
    list: {
      ['workspaces$']: {
        get value() {
          return workspaces;
        },
      },
    },
    create,
    open: ({ metadata }: { metadata: { id: string } }) => ({
      workspace: {
        id: metadata.id,
        engine: {
          doc: {
            waitForDocReady,
          },
        },
        scope: {
          get: (token: symbol) => {
            if (token === docsServiceToken) {
              return {
                list: {
                  ['docs$']: {
                    value: [
                      {
                        id: 'getting-started',
                        ['title$']: { value: 'Getting Started' },
                      },
                    ],
                  },
                },
              };
            }
            throw new Error('Unexpected service token');
          },
        },
      },
      dispose: vi.fn(),
    }),
  };

  return {
    service,
    createMock,
    workspaces,
  };
}

describe('createFirstAppData', () => {
  test('does not create on desktop when the first-open marker exists', async () => {
    localStorage.setItem('is-first-open', 'false');
    const { createFirstAppData } = await import('../first-app-data');
    const { service, createMock } = createWorkspacesService();

    expect(createFirstAppData(service as never)).toBeUndefined();
    expect(createMock).not.toHaveBeenCalled();
  });

  test('creates on mobile when the first-open marker is stale and no workspace exists', async () => {
    vi.stubGlobal('BUILD_CONFIG', {
      ...originalBuildConfig,
      isMobileEdition: true,
    });
    localStorage.setItem('is-first-open', 'false');
    const { createFirstAppData } = await import('../first-app-data');
    const { service, createMock } = createWorkspacesService();

    await expect(createFirstAppData(service as never)).resolves.toMatchObject({
      meta: { id: 'workspace-1', flavour: 'local' },
      defaultPageId: 'getting-started',
    });
    expect(createMock).toHaveBeenCalledOnce();
    expect(localStorage.getItem('is-first-open')).toBe('false');
  });

  test('does not create when any workspace already exists', async () => {
    vi.stubGlobal('BUILD_CONFIG', {
      ...originalBuildConfig,
      isMobileEdition: true,
    });
    const { createFirstAppData } = await import('../first-app-data');
    const { service, createMock } = createWorkspacesService({
      existing: [{ id: 'existing-workspace', flavour: 'local' }],
    });

    expect(createFirstAppData(service as never)).toBeUndefined();
    expect(createMock).not.toHaveBeenCalled();
  });

  test('coalesces concurrent creation attempts', async () => {
    vi.stubGlobal('BUILD_CONFIG', {
      ...originalBuildConfig,
      isMobileEdition: true,
    });
    const { createFirstAppData } = await import('../first-app-data');
    let resolveCreate:
      | ((meta: { id: string; flavour: string }) => void)
      | undefined;
    const { service, createMock, workspaces } = createWorkspacesService({
      createWorkspace: flavour =>
        new Promise(resolve => {
          resolveCreate = meta => {
            workspaces.push(meta);
            resolve(meta);
          };
          expect(flavour).toBe('local');
        }),
    });

    const first = createFirstAppData(service as never);
    const second = createFirstAppData(service as never);
    resolveCreate?.({ id: 'workspace-1', flavour: 'local' });

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        meta: { id: 'workspace-1', flavour: 'local' },
        defaultPageId: 'getting-started',
      },
      {
        meta: { id: 'workspace-1', flavour: 'local' },
        defaultPageId: 'getting-started',
      },
    ]);
    expect(createMock).toHaveBeenCalledOnce();
  });

  test('does not persist the first-open marker when creation fails', async () => {
    vi.stubGlobal('BUILD_CONFIG', {
      ...originalBuildConfig,
      isMobileEdition: true,
    });
    const { createFirstAppData } = await import('../first-app-data');
    const error = new Error('create failed');
    const { service, createMock } = createWorkspacesService({
      createWorkspace: async () => {
        throw error;
      },
    });

    await expect(createFirstAppData(service as never)).rejects.toThrow(error);
    await expect(createFirstAppData(service as never)).rejects.toThrow(error);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('is-first-open')).toBeNull();
  });
});
