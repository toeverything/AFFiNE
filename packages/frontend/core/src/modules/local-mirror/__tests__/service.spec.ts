import type { WorkspaceDBService } from '@affine/core/modules/db';
import type { DesktopApiService } from '@affine/core/modules/desktop-api';
import type { DocsService } from '@affine/core/modules/doc';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { WorkspacePermissionService } from '@affine/core/modules/permissions';
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
  writeBatch?: (input: { files: Array<{ path: string }> }) => Promise<{
    conflicts: string[];
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
  const engineState$ = new BehaviorSubject({ synced: true });
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
  const inspectTarget = vi.fn(async () => ({
    state: 'empty' as const,
    projectRoot: config.projectRoot,
    mirrorPath: `${config.projectRoot}/.affine`,
    manifest: null,
  }));
  const writeBatch = vi.fn(
    options.writeBatch ??
      (async (input: { files: Array<{ path: string }> }) => ({
        conflicts: [],
        hashes: Object.fromEntries(
          input.files.map(file => [file.path, 'hash'])
        ),
      }))
  );
  const finalizeGeneration = vi.fn(async () => ({ conflicts: [] }));
  const beginGeneration = vi.fn(async () => ({ lease: 'lease' }));
  const abortGeneration = vi.fn(async () => undefined);
  const desktopApi = {
    events: { power: { resume: vi.fn(() => () => undefined) } },
    handler: {
      mirror: {
        inspectTarget,
        beginGeneration,
        abortGeneration,
        writeBatch,
        finalizeGeneration,
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
        serializer
      )
  );
  const service = framework.provider().get(LocalMirrorService);
  return {
    service,
    flag$,
    inspectTarget,
    writeBatch,
    finalizeGeneration,
    subscribeDocUpdate,
    emitDocUpdate: (docId: string) => emitDocUpdate?.({ docId }),
  };
}

describe('local mirror permission gate', () => {
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

  test('does not finalize a generation disabled during a write', async () => {
    let finishWrite: (value: {
      conflicts: string[];
      hashes: Record<string, string>;
    }) => void = (_value: {
      conflicts: string[];
      hashes: Record<string, string>;
    }) => {
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
    finishWrite({ conflicts: [], hashes: { 'index.md': 'hash' } });
    await vi.waitFor(() =>
      expect(context.service.status$.value).toEqual({
        type: 'feature-disabled',
      })
    );

    expect(context.finalizeGeneration).not.toHaveBeenCalled();
    context.service.dispose();
  });
});
