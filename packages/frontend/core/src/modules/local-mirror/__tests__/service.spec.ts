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
import { canUseLocalMirror, LocalMirrorService } from '../service';
import type { LocalMirrorConfig } from '../types';

function createService(options: {
  flagEnabled: boolean;
  writeBatch?: () => Promise<{
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
  const subscribeDocUpdate = vi.fn(() => () => undefined);
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
      (async () => ({ conflicts: [], hashes: { 'index.md': 'hash' } }))
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
  };
}

describe('local mirror permission gate', () => {
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
