import type { WorkspaceDBService } from '@affine/core/modules/db';
import type { DesktopApiService } from '@affine/core/modules/desktop-api';
import type { DocsService } from '@affine/core/modules/doc';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type {
  GuardService,
  WorkspacePermissionService,
} from '@affine/core/modules/permissions';
import type { TagService } from '@affine/core/modules/tag';
import type {
  WorkspaceLocalState,
  WorkspaceService,
} from '@affine/core/modules/workspace';
import { Framework, LiveData } from '@toeverything/infra';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import type { LocalMirrorSerializer } from '../serializer';
import {
  canUseLocalMirror,
  decodeMirrorText,
  haveMirrorDocumentPathsChanged,
  LocalMirrorService,
  materializeLocalMirrorAsset,
} from '../service';
import {
  LOCAL_MIRROR_MAX_FILE_BYTES,
  type LocalMirrorConfig,
  type LocalMirrorManifest,
} from '../types';

function createService(options: {
  flagEnabled: boolean;
  engineSynced?: boolean;
  initialManifest?: LocalMirrorManifest;
  migrationConflicts?: string[];
  writeBatch?: (input: { files: Array<{ path: string }> }) => Promise<{
    hashes: Record<string, string>;
  }>;
}) {
  const flag$ = new LiveData(options.flagEnabled);
  const featureFlags = {
    flags: {
      enable_local_workspace_mirror: {
        get value() {
          return flag$.value;
        },
        $: flag$,
      },
    },
  } as unknown as FeatureFlagService;
  const isTeam$ = new LiveData(false as boolean | null);
  const isOwner$ = new LiveData(false as boolean | null);
  const permissions = {
    permission: { isTeam$, isOwner$ },
  } as unknown as WorkspacePermissionService;
  const engineState$ = new BehaviorSubject({
    synced: options.engineSynced ?? true,
  });
  let emitDocUpdate: ((update: { docId: string }) => void) | null = null;
  const subscribeDocUpdate = vi.fn(
    (callback: (update: { docId: string }) => void) => {
      emitDocUpdate = callback;
      return () => undefined;
    }
  );
  const workspace = {
    id: 'workspace-1',
    flavour: 'affine',
    name$: new LiveData('Workspace'),
    engine: {
      doc: {
        state$: engineState$,
        waitForDocLoaded: vi.fn(async () => undefined),
        storage: { subscribeDocUpdate },
      },
    },
  };
  const workspaceService = { workspace } as unknown as WorkspaceService;
  const docs = {
    list: { docs$: new LiveData([]) },
  } as unknown as DocsService;
  const workspaceDB = {
    db: { folders: { find: () => [] } },
  } as unknown as WorkspaceDBService;
  const tagService = {
    tagList: { tagMetas$: new LiveData([]) },
  } as unknown as TagService;
  let config: LocalMirrorConfig = {
    enabled: true,
    projectRoot: 'C:/project',
  };
  const config$ = new BehaviorSubject<LocalMirrorConfig>(config);
  const localState = {
    get: () => config,
    watch: () => config$,
    set: (_key: string, value: LocalMirrorConfig) => {
      config = value;
      config$.next(value);
    },
  } as unknown as WorkspaceLocalState;
  let currentManifest: LocalMirrorManifest | null =
    options.initialManifest ?? null;
  const inspectTarget = vi.fn(async () =>
    currentManifest
      ? {
          state: 'owned' as const,
          projectRoot: config.projectRoot,
          mirrorPath: `${config.projectRoot}/.affine`,
          manifest: currentManifest,
        }
      : {
          state: 'empty' as const,
          projectRoot: config.projectRoot,
          mirrorPath: `${config.projectRoot}/.affine`,
          manifest: null,
        }
  );
  const writeBatch = vi.fn(
    options.writeBatch ??
      (async (input: { files: Array<{ path: string }> }) => ({
        hashes: Object.fromEntries(
          input.files.map(file => [file.path, 'hash'])
        ),
      }))
  );
  const finalizeGeneration = vi.fn(
    async (input: { manifest: LocalMirrorManifest }) => {
      currentManifest = input.manifest;
      return { conflicts: [] };
    }
  );
  const scanTarget = vi.fn(async () => ({
    state: 'owned' as const,
    projectRoot: config.projectRoot,
    mirrorPath: `${config.projectRoot}/.affine`,
    manifest: currentManifest,
    files: Object.fromEntries(
      Object.entries(currentManifest?.files ?? {}).map(([path, entry]) => [
        path,
        { sha256: entry.sha256 },
      ])
    ),
  }));
  const scanVersion1Migration = vi.fn(async () => ({
    conflicts: options.migrationConflicts ?? [],
  }));
  const beginGeneration = vi.fn(async () => ({ lease: 'lease' }));
  const abortGeneration = vi.fn(async () => undefined);
  const startWatching = vi.fn(async () => ({ watcherId: 'watcher' }));
  const stopWatching = vi.fn(async () => undefined);
  let emitMirrorChanged:
    | ((event: { watcherId: string; workspaceId: string }) => void)
    | null = null;
  const changed = vi.fn(
    (callback: (event: { watcherId: string; workspaceId: string }) => void) => {
      emitMirrorChanged = callback;
      return () => {
        emitMirrorChanged = null;
      };
    }
  );
  const guard = {
    can: vi.fn(async () => true),
  } as unknown as GuardService;
  const desktopApi = {
    events: {
      power: { resume: vi.fn(() => () => undefined) },
      mirror: { changed },
    },
    handler: {
      mirror: {
        inspectTarget,
        beginGeneration,
        abortGeneration,
        writeBatch,
        finalizeGeneration,
        scanTarget,
        scanVersion1Migration,
        startWatching,
        stopWatching,
      },
    },
  } as unknown as DesktopApiService;
  const serializer = {} as LocalMirrorSerializer;

  const framework = new Framework();
  framework.service(
    LocalMirrorService,
    () =>
      new LocalMirrorService(
        featureFlags,
        permissions,
        workspaceService,
        docs,
        workspaceDB,
        tagService,
        localState,
        desktopApi,
        serializer,
        guard
      )
  );
  const service = framework.provider().get(LocalMirrorService);
  return {
    service,
    flag$,
    inspectTarget,
    writeBatch,
    finalizeGeneration,
    scanTarget,
    scanVersion1Migration,
    changed,
    startWatching,
    stopWatching,
    subscribeDocUpdate,
    emitDocUpdate: (docId: string) => emitDocUpdate?.({ docId }),
    emitMirrorChanged: () =>
      emitMirrorChanged?.({
        watcherId: 'watcher',
        workspaceId: 'workspace-1',
      }),
  };
}

describe('local mirror permission gate', () => {
  test('rejects malformed UTF-8 before parsing local Markdown', () => {
    expect(() =>
      decodeMirrorText(new Uint8Array([0xc3, 0x28]), 'docs/Notes.md')
    ).toThrow('not valid UTF-8');
  });

  test('rejects an oversized asset before materializing its bytes', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const blob = {
      size: LOCAL_MIRROR_MAX_FILE_BYTES + 1,
      arrayBuffer,
    } as unknown as Blob;

    await expect(
      materializeLocalMirrorAsset(
        {
          assetId: 'large-asset',
          path: '.metadata/assets/large.bin',
          kind: 'asset',
          docId: 'doc-1',
        },
        blob
      )
    ).rejects.toThrow('Mirror file is too large');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  test('requires a full reconciliation when readable document paths change', () => {
    const manifest: LocalMirrorManifest = {
      formatVersion: 1,
      workspaceId: 'workspace-1',
      workspaceFlavour: 'affine',
      generation: 'generation-1',
      lastCompletedAt: new Date(0).toISOString(),
      sourceSyncState: 'synced',
      files: {
        'docs/Old-title.md': {
          kind: 'markdown',
          sha256: 'hash',
          docId: 'doc-1',
        },
      },
    };

    expect(
      haveMirrorDocumentPathsChanged(
        manifest,
        new Map([['doc-1', 'docs/Old-title.md']])
      )
    ).toBe(false);
    expect(
      haveMirrorDocumentPathsChanged(
        manifest,
        new Map([['doc-1', 'docs/New-title.md']])
      )
    ).toBe(true);
  });

  test('allows local and non-team workspaces', () => {
    expect(canUseLocalMirror('local', null, null)).toBe(true);
    expect(canUseLocalMirror('affine', false, false)).toBe(true);
  });

  test('fails closed for unresolved and non-owner team permissions', () => {
    expect(canUseLocalMirror('affine', null, null)).toBe(false);
    expect(canUseLocalMirror('affine', true, false)).toBe(false);
    expect(canUseLocalMirror('affine', true, true)).toBe(true);
  });

  test('does not inspect or subscribe when the experiment is disabled', async () => {
    const context = createService({ flagEnabled: false });
    context.service.onWorkspaceInitialized();
    await Promise.resolve();

    expect(context.subscribeDocUpdate).not.toHaveBeenCalled();
    expect(context.changed).not.toHaveBeenCalled();
    expect(context.inspectTarget).not.toHaveBeenCalled();
    expect(context.service.status$.value).toEqual({
      type: 'feature-disabled',
    });
    context.service.dispose();
  });

  test('uses a trailing debounce for document updates', async () => {
    const context = createService({ flagEnabled: true });
    context.service.onWorkspaceInitialized();
    await vi.waitFor(() =>
      expect(context.finalizeGeneration).toHaveBeenCalledTimes(1)
    );
    await vi.waitFor(() => expect(context.scanTarget).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 800));
    expect(context.finalizeGeneration).toHaveBeenCalledTimes(1);
    context.finalizeGeneration.mockClear();

    context.emitDocUpdate('doc-1');
    await new Promise(resolve => setTimeout(resolve, 500));
    context.emitDocUpdate('doc-1');
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(context.finalizeGeneration).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(context.finalizeGeneration).toHaveBeenCalledTimes(1)
    );
    context.service.dispose();
  });

  test('scans an existing v2 mirror before the first outbound generation', async () => {
    const initialManifest: LocalMirrorManifest = {
      formatVersion: 2,
      workspaceId: 'workspace-1',
      workspaceFlavour: 'affine',
      generation: 'generation-1',
      lastCompletedAt: new Date(0).toISOString(),
      sourceSyncState: 'synced',
      files: {
        'index.md': { kind: 'index', sha256: 'old-hash' },
      },
    };
    const context = createService({ flagEnabled: true, initialManifest });
    context.service.onWorkspaceInitialized();

    await vi.waitFor(
      () => expect(context.finalizeGeneration).toHaveBeenCalledTimes(1),
      { timeout: 3000 }
    );
    expect(context.startWatching).toHaveBeenCalledTimes(1);
    expect(context.scanTarget).toHaveBeenCalled();
    expect(context.scanTarget.mock.invocationCallOrder[0]).toBeLessThan(
      context.finalizeGeneration.mock.invocationCallOrder[0]
    );
    context.service.dispose();
  });

  test('does not drop an outbound update when a watcher rescan is pending', async () => {
    const context = createService({ flagEnabled: true });
    context.service.onWorkspaceInitialized();
    await vi.waitFor(() =>
      expect(context.service.status$.value.type).toBe('idle')
    );
    context.finalizeGeneration.mockClear();
    context.scanTarget.mockClear();

    context.emitDocUpdate('workspace-1');
    context.emitMirrorChanged();

    await vi.waitFor(() => expect(context.scanTarget).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(context.finalizeGeneration).toHaveBeenCalledTimes(1)
    );
    context.service.dispose();
  });

  test('does not finalize a generation disabled during a write', async () => {
    let finishWrite: (value: {
      hashes: Record<string, string>;
    }) => void = (_value: { hashes: Record<string, string> }) => {
      throw new Error('Write was not started');
    };
    const context = createService({
      flagEnabled: true,
      writeBatch: () =>
        new Promise(resolve => {
          finishWrite = resolve;
        }),
    });
    context.service.onWorkspaceInitialized();
    await vi.waitFor(() => expect(context.writeBatch).toHaveBeenCalled());

    context.flag$.setValue(false);
    finishWrite({ hashes: { 'index.md': 'hash' } });
    await vi.waitFor(() =>
      expect(context.service.status$.value).toEqual({
        type: 'feature-disabled',
      })
    );

    expect(context.finalizeGeneration).not.toHaveBeenCalled();
    context.service.dispose();
  });

  test('keeps local edits pending while workspace sync is offline', async () => {
    const context = createService({
      flagEnabled: true,
      engineSynced: false,
    });
    context.service.onWorkspaceInitialized();
    await vi.waitFor(() =>
      expect(context.startWatching).toHaveBeenCalledTimes(1)
    );

    context.emitMirrorChanged();
    await vi.waitFor(() =>
      expect(context.service.status$.value).toEqual({
        type: 'external-change-pending',
        message: 'Local edits will be applied after AFFiNE finishes syncing',
      })
    );
    context.service.dispose();
  });

  test('stops its watcher when the workspace runtime is disposed', async () => {
    const context = createService({ flagEnabled: true });
    context.service.onWorkspaceInitialized();
    await vi.waitFor(() =>
      expect(context.startWatching).toHaveBeenCalledTimes(1)
    );

    context.service.dispose();
    await vi.waitFor(() =>
      expect(context.stopWatching).toHaveBeenCalledWith({
        watcherId: 'watcher',
      })
    );
  });

  test('uses confirmed AFFiNE replacement to resolve a v1 migration conflict', async () => {
    const initialManifest: LocalMirrorManifest = {
      formatVersion: 1,
      workspaceId: 'workspace-1',
      workspaceFlavour: 'affine',
      generation: 'generation-1',
      lastCompletedAt: new Date(0).toISOString(),
      sourceSyncState: 'synced',
      files: {
        'index.md': { kind: 'index', sha256: 'old-hash' },
      },
    };
    const context = createService({
      flagEnabled: true,
      initialManifest,
      migrationConflicts: ['index.md'],
    });
    context.service.onWorkspaceInitialized();
    await vi.waitFor(() =>
      expect(context.service.status$.value).toEqual({
        type: 'migration-conflict',
        paths: ['index.md'],
      })
    );
    expect(context.finalizeGeneration).not.toHaveBeenCalled();

    context.service.replaceLocalChanges();
    await vi.waitFor(() =>
      expect(context.finalizeGeneration).toHaveBeenCalledTimes(1)
    );
    expect(context.finalizeGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ replaceConflicts: true })
    );
    context.service.dispose();
  });
});
