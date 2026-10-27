/** @vitest-environment happy-dom */

import { notify } from '@affine/component';
import { type Server, ServersService } from '@affine/core/modules/cloud';
import { ImportClipperService } from '@affine/core/modules/import-clipper';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { ServerDeploymentType } from '@affine/graphql';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as Infra from '@toeverything/infra';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ShareImportController } from './index';
import type { PendingShareItem } from './types';

const controllerServiceMocks = vi.hoisted(() => ({
  services: new Map<string, unknown>(),
}));

vi.mock('@toeverything/infra', async importOriginal => {
  const original = await importOriginal<typeof Infra>();
  return {
    ...original,
    useLiveData: (source: { value: unknown } | undefined) => source?.value,
    useService: (token: { name: string }) =>
      controllerServiceMocks.services.get(token.name),
  };
});

const item = () =>
  ({
    id: 'item',
    documentId: 'doc',
    schemaVersion: 2,
    importAttemptId: 'attempt',
    title: 'Shared',
    content: { kind: 'url', url: 'https://youtube.com/watch?v=123' },
  }) as unknown as PendingShareItem;

const workspace = (flavour: string) =>
  ({ id: 'workspace', flavour }) as WorkspaceMetadata;

const server = (id: string, baseUrl: string, type?: ServerDeploymentType) =>
  ({
    id,
    baseUrl,
    config$: new Infra.LiveData({ type }),
    fetch: (...args: Parameters<typeof globalThis.fetch>) =>
      globalThis.fetch(...args),
  }) as unknown as Server;

afterEach(() => {
  cleanup();
  controllerServiceMocks.services.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('share destination selection lifecycle', () => {
  test.each(['imported', 'committed-replay'] as const)(
    'completes the native item after an %s result',
    async status => {
      const selectedWorkspace = workspace('local');
      const pending = {
        ...item(),
        target: {
          workspaceId: selectedWorkspace.id,
          workspaceFlavour: selectedWorkspace.flavour,
          tagIds: [],
        },
      } satisfies PendingShareItem;
      let completed = false;
      const importer = {
        getShareDestinationOptions: vi.fn().mockResolvedValue({
          verification: 'confirmed',
          tags: [],
          collections: [],
        }),
        importShareToWorkspace: vi
          .fn()
          .mockResolvedValue({ status, docId: pending.documentId }),
      };
      controllerServiceMocks.services.set(WorkspacesService.name, {
        list: { workspaces$: { value: [selectedWorkspace] } },
        getProfile: () => ({ name$: { value: 'Local workspace' } }),
      });
      controllerServiceMocks.services.set(ServersService.name, {
        serversWithAccount$: { value: [] },
        servers$: { value: [] },
      });
      controllerServiceMocks.services.set(ImportClipperService.name, importer);
      const provider = {
        updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
        listPending: vi.fn(async () =>
          completed ? [] : [{ status: 'ready' as const, item: pending }]
        ),
        updateTarget: vi.fn().mockResolvedValue(undefined),
        resolveAttachment: vi.fn().mockResolvedValue(undefined),
        complete: vi.fn().mockImplementation(async () => {
          completed = true;
        }),
        setError: vi.fn().mockResolvedValue(undefined),
      };

      render(<ShareImportController provider={provider} />);

      await waitFor(() =>
        expect(provider.complete).toHaveBeenCalledWith(
          pending.id,
          pending.documentId
        )
      );
      expect(provider.setError).not.toHaveBeenCalled();
    }
  );

  test.each([
    'attachment-missing',
    'permission-denied',
    'destination-not-found',
    'offline-confirmation-required',
    'import-conflict',
    'attachment-write-failed',
  ] as const)('does not complete a native item after %s', async status => {
    const selectedWorkspace = workspace('local');
    const pending = {
      ...item(),
      target: {
        workspaceId: selectedWorkspace.id,
        workspaceFlavour: selectedWorkspace.flavour,
        tagIds: [],
      },
    } satisfies PendingShareItem;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi.fn().mockResolvedValue({ status }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: pending }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await waitFor(() =>
      expect(provider.setError).toHaveBeenCalledWith(pending.id, status)
    );
    expect(provider.complete).not.toHaveBeenCalled();
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1);
  });

  test('shows one local recovery error without retrying completion in the same refresh', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const selectedWorkspace = workspace('local');
    const pending = {
      ...item(),
      target: {
        workspaceId: selectedWorkspace.id,
        workspaceFlavour: selectedWorkspace.flavour,
        tagIds: [],
      },
    } satisfies PendingShareItem;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValue({ status: 'imported', docId: pending.documentId }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: pending }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockRejectedValue(new Error('cleanup failed')),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText(
      'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(provider.setError).not.toHaveBeenCalledWith(
      pending.id,
      'completion-failed'
    );
  });

  test('clears a completion-failed item when native cleanup hides its result marker', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notifySuccess = vi.spyOn(notify, 'success');
    const selectedWorkspace = workspace('local');
    const pending = {
      ...item(),
      target: {
        workspaceId: selectedWorkspace.id,
        workspaceFlavour: selectedWorkspace.flavour,
        tagIds: [],
      },
    } satisfies PendingShareItem;
    let markerHidden = false;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValue({ status: 'imported', docId: pending.documentId }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi.fn(async () =>
        markerHidden ? [] : [{ status: 'ready' as const, item: pending }]
      ),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockRejectedValue(new Error('cleanup failed')),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText(
      'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
    );
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await waitFor(() =>
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    );

    markerHidden = true;
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(screen.queryByText('Choose where to save')).toBeNull()
    );
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(provider.setError).not.toHaveBeenCalledWith(
      pending.id,
      'completion-failed'
    );
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  test('manually retries completion through committed replay and clears the item', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notifySuccess = vi.spyOn(notify, 'success');
    const selectedWorkspace = workspace('local');
    const uiWorkspace = {
      id: 'ui-workspace',
      flavour: 'local',
    } as WorkspaceMetadata;
    const persistedTarget = {
      workspaceId: selectedWorkspace.id,
      workspaceFlavour: selectedWorkspace.flavour,
      tagIds: ['persisted-tag'],
      collectionId: 'persisted-collection',
    };
    const pending = {
      ...item(),
      target: persistedTarget,
    } satisfies PendingShareItem;
    let completed = false;
    const committedReplay = {
      status: 'committed-replay' as const,
      docId: pending.documentId,
    };
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'imported',
          docId: pending.documentId,
        })
        .mockResolvedValueOnce(committedReplay),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace, uiWorkspace] } },
      getProfile: (current: WorkspaceMetadata) => ({
        name$: {
          value:
            current.id === selectedWorkspace.id
              ? 'Persisted workspace'
              : 'UI workspace',
        },
      }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi.fn(async () =>
        completed ? [] : [{ status: 'ready' as const, item: pending }]
      ),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('cleanup failed'))
        .mockImplementationOnce(async () => {
          completed = true;
        }),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText(
      'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
    );
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await waitFor(() =>
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Workspace Persisted workspace/ })
    );
    fireEvent.click(screen.getByRole('button', { name: /UI workspace/ }));
    const retryButton = screen.getByRole('button', { name: 'Save' });
    await waitFor(() =>
      expect((retryButton as HTMLButtonElement).disabled).toBe(false)
    );

    fireEvent.click(retryButton);

    await waitFor(() => expect(provider.complete).toHaveBeenCalledTimes(2));
    await expect(
      importer.importShareToWorkspace.mock.results[1]?.value
    ).resolves.toEqual(committedReplay);
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(2);
    expect(importer.importShareToWorkspace).toHaveBeenNthCalledWith(
      2,
      selectedWorkspace,
      expect.objectContaining({
        tagIds: persistedTarget.tagIds,
        collectionId: persistedTarget.collectionId,
      }),
      { allowOffline: false }
    );
    expect(provider.updateTarget).toHaveBeenLastCalledWith(
      pending.id,
      persistedTarget
    );
    expect(provider.complete).toHaveBeenNthCalledWith(
      1,
      pending.id,
      pending.documentId
    );
    expect(provider.complete).toHaveBeenNthCalledWith(
      2,
      pending.id,
      pending.documentId
    );
    expect(provider.setError).not.toHaveBeenCalledWith(
      pending.id,
      'completion-failed'
    );
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText('Choose where to save')).toBeNull()
    );
    expect(
      screen.queryByText(
        'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
      )
    ).toBeNull();
  });

  test('cold-start replay retries only completion and emits one success notification', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notifySuccess = vi.spyOn(notify, 'success');
    const selectedWorkspace = workspace('local');
    const pending = {
      ...item(),
      target: {
        workspaceId: selectedWorkspace.id,
        workspaceFlavour: selectedWorkspace.flavour,
        tagIds: [],
      },
    } satisfies PendingShareItem;
    let completed = false;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'imported',
          docId: pending.documentId,
        })
        .mockResolvedValueOnce({
          status: 'committed-replay',
          docId: pending.documentId,
        }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi.fn(async () =>
        completed ? [] : [{ status: 'ready' as const, item: pending }]
      ),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('cleanup failed'))
        .mockImplementationOnce(async () => {
          completed = true;
        }),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    const firstLaunch = render(<ShareImportController provider={provider} />);
    await screen.findByText(
      'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
    );
    firstLaunch.unmount();

    render(<ShareImportController provider={provider} />);

    await waitFor(() => expect(provider.complete).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1));
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(2);
    expect(provider.complete).toHaveBeenLastCalledWith(
      pending.id,
      pending.documentId
    );
    expect(screen.queryByText('Choose where to save')).toBeNull();
  });

  test('ignores a stale attachment result after the inbox item changes', async () => {
    let resolveA!: (file: File | undefined) => void;
    let resolveB!: (file: File | undefined) => void;
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce('blob:b')
      .mockReturnValueOnce('blob:unexpected');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const itemA = {
      ...item(),
      id: 'a',
      content: { kind: 'image' as const },
    } satisfies PendingShareItem;
    const itemB = { ...itemA, id: 'b' };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [] } },
      getProfile: () => ({ name$: { value: '' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {});
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValueOnce([{ status: 'ready' as const, item: itemA }])
        .mockResolvedValueOnce([{ status: 'ready' as const, item: itemB }]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn((id: string) =>
        id === 'a'
          ? new Promise<File | undefined>(resolve => (resolveA = resolve))
          : new Promise<File | undefined>(resolve => (resolveB = resolve))
      ),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    const view = render(<ShareImportController provider={provider} />);
    await screen.findByText('Shared');
    window.dispatchEvent(new Event('affine:share-inbox'));
    await waitFor(() =>
      expect(provider.resolveAttachment).toHaveBeenCalledWith('b')
    );

    resolveB(new File(['b'], 'b.png', { type: 'image/png' }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    resolveA(new File(['a'], 'a.png', { type: 'image/png' }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:b');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:b');
  });

  test('queues an inbox refresh event received while listPending is in flight', async () => {
    let resolveFirst!: (entries: []) => void;
    const pending = item();
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [] } },
      getProfile: () => ({ name$: { value: '' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {});
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<[]>(resolve => {
              resolveFirst = resolve;
            })
        )
        .mockResolvedValueOnce([{ status: 'ready' as const, item: pending }]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn(),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    render(<ShareImportController provider={provider} />);
    await waitFor(() => expect(provider.listPending).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('affine:share-inbox'));
    resolveFirst([]);

    await screen.findByText('Choose where to save');
    expect(provider.listPending).toHaveBeenCalledTimes(2);
  });

  test('does not import or complete an item twice when refresh joins a manual save', async () => {
    const selectedWorkspace = workspace('local');
    const shared = item();
    let savedTarget: PendingShareItem['target'];
    let completed = false;
    let resolveImport!: (result: { status: 'imported'; docId: string }) => void;
    const importResult = new Promise<{ status: 'imported'; docId: string }>(
      resolve => {
        resolveImport = resolve;
      }
    );
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi.fn(() => importResult),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi.fn(async () =>
        completed
          ? []
          : [
              {
                status: 'ready' as const,
                item: savedTarget ? { ...shared, target: savedTarget } : shared,
              },
            ]
      ),
      updateTarget: vi.fn(
        async (_itemId: string, target: PendingShareItem['target']) => {
          savedTarget = target;
        }
      ),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn(async () => {
        if (completed) throw new Error('already completed');
        completed = true;
      }),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);
    await screen.findByText('Choose where to save');
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Local workspace/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1)
    );

    window.dispatchEvent(new Event('affine:share-inbox'));
    await waitFor(() => expect(provider.listPending).toHaveBeenCalledTimes(2));
    resolveImport({ status: 'imported', docId: shared.documentId });

    await waitFor(() => expect(provider.complete).toHaveBeenCalledTimes(1));
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1);
  });

  test('does not retain or create an object URL when an attachment resolves after unmount', async () => {
    let resolveAttachment!: (file: File | undefined) => void;
    const createObjectURL = vi.fn(() => 'blob:late');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const shared = {
      ...item(),
      content: { kind: 'image' as const },
    } satisfies PendingShareItem;
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [] } },
      getProfile: () => ({ name$: { value: '' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {});
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: shared }]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn(
        () =>
          new Promise<File | undefined>(
            resolve => (resolveAttachment = resolve)
          )
      ),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    const view = render(<ShareImportController provider={provider} />);
    await screen.findByText('Shared');
    view.unmount();
    resolveAttachment(new File(['late'], 'late.png', { type: 'image/png' }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  test('retains the original image preview across workspace switches and revokes it on unmount', async () => {
    const createObjectURL = vi.fn(() => 'blob:shared-image');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const image = new File(['image'], 'shared.png', { type: 'image/png' });
    const shared = {
      ...item(),
      content: { kind: 'image' as const },
      attachments: [{ fileName: 'shared.png', mimeType: 'image/png' }],
    } satisfies PendingShareItem;
    const workspaceA = {
      id: 'workspace-a',
      flavour: 'local',
    } as WorkspaceMetadata;
    const workspaceB = {
      id: 'workspace-b',
      flavour: 'local',
    } as WorkspaceMetadata;
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [workspaceA, workspaceB] } },
      getProfile: (metadata: WorkspaceMetadata) => ({
        name$: {
          value: metadata.id === workspaceA.id ? 'Workspace A' : 'Workspace B',
        },
      }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
    });
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: shared }]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn().mockResolvedValue(image),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    const view = render(<ShareImportController provider={provider} />);

    await waitFor(() =>
      expect(provider.resolveAttachment).toHaveBeenCalledTimes(1)
    );
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Workspace A/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /Workspace Workspace A/ })
    );
    fireEvent.click(screen.getByRole('button', { name: /Workspace B/ }));

    await waitFor(() =>
      expect(provider.resolveAttachment).toHaveBeenCalledTimes(1)
    );
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'blob:shared-image'
    );
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(image);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      'blob:shared-image'
    );
  });

  test('keeps a PDF inbox item when its File is missing', async () => {
    const selectedWorkspace = workspace('local');
    const shared = {
      ...item(),
      content: { kind: 'pdf' as const },
      attachments: [{ fileName: 'report.pdf', mimeType: 'application/pdf' }],
    } satisfies PendingShareItem;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi.fn(),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: shared }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText('Choose where to save');
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Local workspace/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(provider.setError).toHaveBeenCalledWith(
        'item',
        'attachment-missing'
      )
    );
    expect(importer.importShareToWorkspace).not.toHaveBeenCalled();
    expect(provider.complete).not.toHaveBeenCalled();
  });

  test('does not save workspace A preview after switching to B before B responds', async () => {
    const workspaceA = {
      id: 'workspace-a',
      flavour: 'server-a',
    } as WorkspaceMetadata;
    const workspaceB = {
      id: 'workspace-b',
      flavour: 'server-b',
    } as WorkspaceMetadata;
    const serverA = server(
      'server-a',
      'https://server-a.example/',
      ServerDeploymentType.Selfhosted
    );
    const serverB = server(
      'server-b',
      'https://server-b.example/',
      ServerDeploymentType.Selfhosted
    );
    Object.assign(serverA, {
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ url: item().content.url, title: 'Preview A' }),
            { status: 200 }
          )
        ),
    });
    Object.assign(serverB, {
      fetch: vi.fn(() => new Promise<Response>(() => {})),
    });
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValue({ status: 'imported', docId: 'saved-doc' }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [workspaceA, workspaceB] } },
      getProfile: (workspace: WorkspaceMetadata) => ({
        name$: {
          value: workspace.id === workspaceA.id ? 'Workspace A' : 'Workspace B',
        },
      }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [serverA, serverB] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: item() }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText('Choose where to save');
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Workspace A/ }));
    await screen.findByText('Preview A');

    fireEvent.click(
      screen.getByRole('button', { name: /Workspace Workspace A/ })
    );
    fireEvent.click(screen.getByRole('button', { name: /Workspace B/ }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(
      () => expect(importer.importShareToWorkspace).toHaveBeenCalled(),
      { timeout: 2500 }
    );
    expect(importer.importShareToWorkspace).toHaveBeenCalledWith(
      workspaceB,
      expect.not.objectContaining({ preview: expect.anything() }),
      { allowOffline: false }
    );
  });

  test('keeps one workspace selection across preview completion and refreshes', async () => {
    const selectedWorkspace = {
      id: 'selected-workspace',
      flavour: 'local',
    } as WorkspaceMetadata;
    const workspaces$ = { value: [selectedWorkspace] };
    const servers$ = { value: [] as Server[] };
    const pending = {
      ...item(),
      content: {
        kind: 'url' as const,
        url: 'https://youtube.com/watch?v=selection',
      },
    } satisfies PendingShareItem;
    const previewFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: pending.content.url }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', previewFetch);

    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [{ id: 'tag-one', name: 'Tag One', color: '#123456' }],
        collections: [{ id: 'collection-one', name: 'Collection One' }],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValue({ status: 'imported', docId: 'saved-doc' }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$ },
      getProfile: () => ({ name$: { value: 'Workspace One' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$,
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);

    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: pending }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
    };
    const view = render(<ShareImportController provider={provider} />);

    await screen.findByText('Choose where to save');
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Workspace One/ }));

    const save = await screen.findByRole('button', { name: 'Save' });
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false)
    );
    expect(
      screen.getByRole('button', { name: /Workspace Workspace One/ })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Tags Optional/ }));
    await screen.findByRole('button', { name: /Tag One/ });
    await waitFor(() => expect(provider.listPending).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Tags')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Tag One/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Collection Optional/ })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Collection One' })
    );

    workspaces$.value = [{ ...selectedWorkspace }];
    servers$.value = [];
    view.rerender(<ShareImportController provider={provider} />);
    expect(
      screen.getByRole('button', { name: /Workspace Workspace One/ })
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(provider.listPending).toHaveBeenCalledTimes(1);

    workspaces$.value = [];
    view.rerender(<ShareImportController provider={provider} />);
    expect(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    workspaces$.value = [{ ...selectedWorkspace }];
    view.rerender(<ShareImportController provider={provider} />);
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );

    window.dispatchEvent(new Event('affine:share-inbox'));
    await waitFor(() => expect(provider.listPending).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole('button', { name: /Workspace Workspace One/ })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(provider.updateTarget).toHaveBeenCalledWith('item', {
        workspaceId: 'selected-workspace',
        workspaceFlavour: 'local',
        tagIds: ['tag-one'],
        collectionId: 'collection-one',
      })
    );
    expect(importer.getShareDestinationOptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selected-workspace', flavour: 'local' })
    );
    expect(importer.importShareToWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selected-workspace', flavour: 'local' }),
      expect.objectContaining({
        tagIds: ['tag-one'],
        collectionId: 'collection-one',
      }),
      { allowOffline: false }
    );
  });

  test('leaves an unsupported inbox entry intact while showing the upgrade-required state', async () => {
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [] } },
      getProfile: () => ({ name$: { value: '' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {});
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi.fn().mockResolvedValue([
        {
          status: 'unsupported-version' as const,
          id: 'item',
          schemaVersion: 3,
        },
      ]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn(),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText('Update required');
    expect(screen.getByText(/stay in your inbox until then/i)).toBeTruthy();
    expect(provider.complete).not.toHaveBeenCalled();
  });
});
