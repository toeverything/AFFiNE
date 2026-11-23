// @vitest-environment happy-dom

import type { BlobSource } from '@blocksuite/affine/sync';
import { act, renderHook } from '@testing-library/react';
import type * as Infra from '@toeverything/infra';
import { afterEach, expect, test, vi } from 'vitest';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import * as WorkspaceModule from '../../../modules/workspace/impls/workspace';
import { useRestorePage, useSnapshotPage } from './data';

const historyMocks = vi.hoisted(() => ({
  services: new Map<string, unknown>(),
  sources: [] as BlobSource[],
  page: undefined as { spaceDoc: YDoc; meta: { title: string } } | undefined,
  recover: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('@toeverything/infra', async importOriginal => ({
  ...(await importOriginal<typeof Infra>()),
  useService: (token: { name: string }) =>
    historyMocks.services.get(token.name),
}));

vi.mock('@affine/core/components/hooks/use-block-suite-workspace-page', () => ({
  useDocCollectionPage: () => historyMocks.page,
}));
vi.mock('@affine/core/components/hooks/use-block-suite-page-meta', () => ({
  useDocMetaHelper: () => ({
    getDocMeta: () => ({ title: '' }),
    setDocTitle: vi.fn(),
  }),
}));
vi.mock('../../../components/hooks/use-mutation', () => ({
  useMutation: () => ({ trigger: historyMocks.recover, isMutating: false }),
  useMutateQueryResource: () => historyMocks.mutate,
}));

vi.mock('swr/immutable', () => ({ default: () => ({ data: undefined }) }));

vi.mock(
  '@affine/core/modules/workspace/impls/workspace',
  async importOriginal => {
    const actual = await importOriginal<typeof WorkspaceModule>();
    return {
      ...actual,
      WorkspaceImpl: class extends actual.WorkspaceImpl {
        constructor(
          options: ConstructorParameters<typeof actual.WorkspaceImpl>[0]
        ) {
          super(options);
          if (options.blobSource) historyMocks.sources.push(options.blobSource);
        }
      },
    };
  }
);

afterEach(() => {
  historyMocks.services.clear();
  historyMocks.sources.length = 0;
  historyMocks.page = undefined;
  historyMocks.recover.mockReset();
  historyMocks.mutate.mockReset();
});

test.each(['present', 'null', 'missing', 'no-session', 'error'])(
  'history source resolves %s without dropping its source or swallowing errors',
  async mode => {
    const remote = new Blob(['remote']);
    const local = new Blob(['local']);
    const error = new Error('permission denied');
    const get =
      mode === 'error'
        ? vi.fn().mockRejectedValue(error)
        : vi.fn().mockResolvedValue(mode === 'present' ? remote : null);
    const close = vi.fn().mockResolvedValue(undefined);
    const openWorkspaceBlobSource = vi.fn(() => ({ get, close }));
    const getWorkspaceBlob = vi
      .fn()
      .mockResolvedValue(mode === 'missing' ? null : local);
    const provider = {
      getWorkspaceBlob,
      ...(mode === 'no-session' ? {} : { openWorkspaceBlobSource }),
    };
    historyMocks.services.set('WorkspaceService', { workspace: { meta: {} } });
    historyMocks.services.set('WorkspacesService', {
      getWorkspaceFlavourProvider: () => provider,
    });
    historyMocks.services.set('FetchService', {});
    const collection = new WorkspaceModule.WorkspaceImpl({
      id: 'workspace-1',
      rootDoc: new YDoc({ guid: 'workspace-1' }),
    });
    const timestamp = '2026-09-09T00:00:00Z';
    const view = renderHook(() =>
      useSnapshotPage(collection, 'doc-1', timestamp)
    );
    try {
      expect(historyMocks.sources).toHaveLength(1);
      const loading = historyMocks.sources[0].get('blob-1');
      if (mode === 'error') {
        await expect(loading).rejects.toBe(error);
      } else {
        await expect(loading).resolves.toBe(
          mode === 'present' ? remote : mode === 'missing' ? null : local
        );
      }
      const source = {
        type: 'history',
        workspaceId: 'workspace-1',
        docId: 'doc-1',
        timestampMs: Date.parse(timestamp),
      };
      if (mode !== 'no-session') {
        expect(openWorkspaceBlobSource).toHaveBeenCalledWith(
          'workspace-1',
          source
        );
        expect(get).toHaveBeenCalledWith('blob-1');
      }
      if (mode === 'present' || mode === 'error') {
        expect(getWorkspaceBlob).not.toHaveBeenCalled();
      } else {
        expect(getWorkspaceBlob).toHaveBeenCalledWith(
          'workspace-1',
          'blob-1',
          source
        );
      }
    } finally {
      view.unmount();
      collection.dispose();
    }
    expect(close).toHaveBeenCalledTimes(mode === 'no-session' ? 0 : 1);
  }
);

test.each([false, true])(
  'history checkpoint failure=%s preserves live edits until fixed compensation can apply',
  async fails => {
    const historical = new YDoc();
    historical.getMap('blocks').set('value', 'old');
    const snapshot = encodeStateAsUpdate(historical);
    const live = new YDoc();
    applyUpdate(live, snapshot);
    live.getMap('blocks').set('value', 'before');
    historyMocks.page = { spaceDoc: live, meta: { title: '' } };
    let sync!: () => void;
    const synced = new Promise<void>(resolve => {
      sync = resolve;
    });
    let checkpoint!: () => void;
    let rejectCheckpoint!: (error: Error) => void;
    historyMocks.recover.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          checkpoint = resolve;
          rejectCheckpoint = reject;
        })
    );
    historyMocks.services.set('WorkspaceService', {
      workspace: { engine: { doc: { waitForSynced: () => synced } } },
    });
    const collection = new WorkspaceModule.WorkspaceImpl({
      id: 'workspace-restore',
      rootDoc: new YDoc(),
    });
    const view = renderHook(() => useRestorePage(collection, live.guid));
    let restoring!: Promise<void>;
    act(() => {
      restoring = view.result.current.onRestore(
        '2026-11-10T00:00:00Z',
        snapshot
      );
    });
    expect(view.result.current.isMutating).toBe(true);
    const outcome = restoring.then(
      () => undefined,
      error => error
    );
    try {
      expect(live.getMap('blocks').get('value')).toBe('before');
      expect(historyMocks.recover).not.toHaveBeenCalled();
      live.getMap('blocks').set('concurrent', 'kept');
      sync();
      await vi.waitFor(() =>
        expect(historyMocks.recover).toHaveBeenCalledTimes(1)
      );
      expect(live.getMap('blocks').get('value')).toBe('before');
      expect(view.result.current.isMutating).toBe(true);
      if (fails) rejectCheckpoint(new Error('checkpoint unavailable'));
      else checkpoint();
      let error: unknown;
      await act(async () => {
        error = await outcome;
      });
      expect(view.result.current.isMutating).toBe(false);
      expect(error instanceof Error).toBe(fails);
      expect(live.getMap('blocks').toJSON()).toEqual({
        value: fails ? 'before' : 'old',
        concurrent: 'kept',
      });
    } finally {
      view.unmount();
      collection.dispose();
      historical.destroy();
      live.destroy();
    }
  }
);
