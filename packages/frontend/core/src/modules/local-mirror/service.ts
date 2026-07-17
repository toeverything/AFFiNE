import type { WorkspaceDBService } from '@affine/core/modules/db';
import type { DesktopApiService } from '@affine/core/modules/desktop-api';
import type { DocsService } from '@affine/core/modules/doc';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { WorkspacePermissionService } from '@affine/core/modules/permissions';
import type { TagService } from '@affine/core/modules/tag';
import {
  WorkspaceInitialized,
  type WorkspaceLocalState,
  type WorkspaceService,
} from '@affine/core/modules/workspace';
import type { Store } from '@blocksuite/affine/store';
import { LiveData, OnEvent, Service } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import {
  combineLatest,
  distinctUntilChanged,
  firstValueFrom,
  take,
} from 'rxjs';

import { createMirrorDocPathMap, LOCAL_MIRROR_WORKSPACE_PATH } from './format';
import { createLocalMirrorProjection } from './projection';
import type { LocalMirrorSerializer } from './serializer';
import {
  LOCAL_MIRROR_MAX_FILE_BYTES,
  type LocalMirrorConfig,
  type LocalMirrorDocMetadata,
  type LocalMirrorManifest,
  LocalMirrorManifestSchema,
  type LocalMirrorSerializedAsset,
  type LocalMirrorSerializedDocument,
  type LocalMirrorSerializedFile,
  type LocalMirrorStatus,
} from './types';

const CONFIG_KEY = 'local-workspace-mirror';
const DEFAULT_CONFIG: LocalMirrorConfig = {
  enabled: false,
  projectRoot: null,
};

class LocalMirrorConflictError extends Error {
  constructor(readonly paths: string[]) {
    super('Local mirror contains modified files');
  }
}

export function canUseLocalMirror(
  workspaceFlavour: string,
  isTeam: boolean | null,
  isOwner: boolean | null
) {
  return (
    workspaceFlavour === 'local' ||
    isTeam === false ||
    (isTeam === true && isOwner === true)
  );
}

export function haveMirrorDocumentPathsChanged(
  manifest: LocalMirrorManifest,
  docPaths: ReadonlyMap<string, string>
) {
  const markdownEntries = Object.entries(manifest.files).filter(
    ([, file]) => file.kind === 'markdown' && file.docId
  );
  return (
    markdownEntries.length !== docPaths.size ||
    markdownEntries.some(
      ([path, file]) => !file.docId || docPaths.get(file.docId) !== path
    )
  );
}

export async function materializeLocalMirrorAsset(
  asset: LocalMirrorSerializedAsset,
  blob: Blob
): Promise<LocalMirrorSerializedFile> {
  if (blob.size > LOCAL_MIRROR_MAX_FILE_BYTES) {
    throw new Error('Mirror file is too large');
  }
  const content = new Uint8Array(await blob.arrayBuffer());
  if (content.byteLength > LOCAL_MIRROR_MAX_FILE_BYTES) {
    throw new Error('Mirror file is too large');
  }
  return { ...asset, content };
}

@OnEvent(WorkspaceInitialized, service => service.onWorkspaceInitialized)
export class LocalMirrorService extends Service {
  readonly config$ = LiveData.from<LocalMirrorConfig | undefined>(
    this.localState.watch<LocalMirrorConfig>(CONFIG_KEY),
    this.localState.get<LocalMirrorConfig>(CONFIG_KEY)
  ).map(config => config ?? DEFAULT_CONFIG);

  readonly status$ = new LiveData<LocalMirrorStatus>({ type: 'disabled' });

  private runtimeActive = false;
  private generationToken = 0;
  private updateDispose: (() => void) | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private pending = false;
  private fullPending = false;
  private readonly dirtyDocIds = new Set<string>();
  private replaceConflicts = false;
  private activeLease: string | null = null;
  private activeAbort: AbortController | null = null;

  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly permissions: WorkspacePermissionService,
    private readonly workspaceService: WorkspaceService,
    private readonly docs: DocsService,
    private readonly workspaceDB: WorkspaceDBService,
    private readonly tagService: TagService,
    private readonly localState: WorkspaceLocalState,
    private readonly desktopApi: DesktopApiService,
    private readonly serializer: LocalMirrorSerializer
  ) {
    super();
  }

  onWorkspaceInitialized() {
    let previousProjectRoot = this.config.projectRoot;
    const gateSubscription = combineLatest([
      this.featureFlags.flags.enable_local_workspace_mirror.$,
      this.permissions.permission.isTeam$,
      this.permissions.permission.isOwner$,
      this.config$,
    ]).subscribe(([, , , config]) => {
      if (this.runtimeActive && config.projectRoot !== previousProjectRoot) {
        this.stopRuntime({ type: 'not-configured' });
      }
      previousProjectRoot = config.projectRoot;
      this.evaluateGate();
    });
    this.disposables.push(() => gateSubscription.unsubscribe());

    let wasSynced = false;
    const syncSubscription = this.workspace.engine.doc.state$
      .pipe(distinctUntilChanged((left, right) => left.synced === right.synced))
      .subscribe(state => {
        if (state.synced && !wasSynced && this.runtimeActive) {
          this.scheduleReconciliation(0, false, true);
        }
        wasSynced = state.synced;
      });
    this.disposables.push(() => syncSubscription.unsubscribe());
    const unsubscribeResume = this.desktopApi.events.power.resume(() => {
      if (this.runtimeActive) this.scheduleReconciliation(0, false, true);
    });
    this.disposables.push(unsubscribeResume);
    if (typeof document !== 'undefined') {
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible' && this.runtimeActive) {
          this.scheduleReconciliation(0, false, true);
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      this.disposables.push(() =>
        document.removeEventListener('visibilitychange', onVisibilityChange)
      );
    }
    this.evaluateGate();
  }

  get config() {
    return this.localState.get<LocalMirrorConfig>(CONFIG_KEY) ?? DEFAULT_CONFIG;
  }

  private get workspace() {
    return this.workspaceService.workspace;
  }

  private permissionGranted() {
    return canUseLocalMirror(
      this.workspace.flavour,
      this.permissions.permission.isTeam$.value,
      this.permissions.permission.isOwner$.value
    );
  }

  private runtimeReason(): LocalMirrorStatus | null {
    if (!this.featureFlags.flags.enable_local_workspace_mirror.value) {
      return { type: 'feature-disabled' };
    }
    if (!this.permissionGranted()) return { type: 'permission-denied' };
    if (!this.config.enabled) return { type: 'disabled' };
    if (!this.config.projectRoot) return { type: 'not-configured' };
    return null;
  }

  private evaluateGate() {
    const reason = this.runtimeReason();
    if (reason) {
      this.stopRuntime(reason);
      return;
    }
    if (this.runtimeActive) return;
    this.runtimeActive = true;
    this.updateDispose = this.workspace.engine.doc.storage.subscribeDocUpdate(
      update => {
        if (
          update.docId === this.workspace.id ||
          update.docId.startsWith('db$') ||
          update.docId.startsWith('userdata$')
        ) {
          this.scheduleReconciliation(750, false, true);
          return;
        }
        this.scheduleReconciliation(750, false, false, update.docId);
      }
    );
    this.scheduleReconciliation(0, false, true);
  }

  private stopRuntime(status: LocalMirrorStatus) {
    this.runtimeActive = false;
    this.generationToken++;
    this.updateDispose?.();
    this.updateDispose = null;
    this.pending = false;
    this.fullPending = false;
    this.dirtyDocIds.clear();
    this.replaceConflicts = false;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = null;
    this.activeAbort?.abort();
    this.activeAbort = null;
    const lease = this.activeLease;
    this.activeLease = null;
    if (lease) {
      this.desktopApi.handler.mirror
        .abortGeneration({ lease })
        .catch(console.error);
    }
    this.status$.setValue(status);
  }

  private assertCanRun(token: number) {
    const reason = this.runtimeReason();
    if (reason || token !== this.generationToken || !this.runtimeActive) {
      throw new DOMException('Local mirror operation aborted', 'AbortError');
    }
  }

  private scheduleReconciliation(
    delay = 750,
    replaceConflicts = false,
    full = true,
    docId?: string
  ) {
    if (!this.runtimeActive) return;
    this.pending = true;
    if (full) {
      this.fullPending = true;
      this.dirtyDocIds.clear();
    } else if (!this.fullPending && docId) {
      this.dirtyDocIds.add(docId);
    }
    this.replaceConflicts ||= replaceConflicts;
    if (this.running) return;
    this.armReconciliation(delay);
  }

  private armReconciliation(delay: number) {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      this.drainQueue().catch(console.error);
    }, delay);
  }

  private async drainQueue() {
    if (this.running) return;
    this.running = true;
    try {
      if (this.pending && this.runtimeActive) {
        this.pending = false;
        const replaceConflicts = this.replaceConflicts;
        const full = this.fullPending;
        const dirtyDocIds = [...this.dirtyDocIds];
        this.replaceConflicts = false;
        this.fullPending = false;
        this.dirtyDocIds.clear();
        try {
          if (full || dirtyDocIds.length === 0) {
            await this.reconcile(replaceConflicts);
          } else {
            await this.reconcileDocuments(dirtyDocIds, replaceConflicts);
          }
        } catch (error) {
          if (error instanceof LocalMirrorConflictError) {
            this.status$.setValue({ type: 'conflict', paths: error.paths });
          } else if ((error as Error).name !== 'AbortError') {
            this.status$.setValue({
              type: 'error',
              message: (error as Error).message,
            });
          }
        } finally {
          await this.abortActiveGeneration();
        }
      }
    } finally {
      this.running = false;
      if (this.pending && this.runtimeActive) this.armReconciliation(750);
    }
  }

  private async writeFiles(
    token: number,
    generation: string,
    projectRoot: string,
    files: LocalMirrorSerializedFile[],
    manifestFiles: LocalMirrorManifest['files'],
    replaceConflicts: boolean
  ) {
    const lease = this.activeLease;
    if (!lease)
      throw new DOMException('Mirror generation aborted', 'AbortError');
    for (const file of files) {
      this.assertCanRun(token);
      const result = await this.desktopApi.handler.mirror.writeBatch({
        lease,
        projectRoot,
        workspaceId: this.workspace.id,
        generation,
        files: [file],
        replaceConflicts,
      });
      if (result.conflicts.length > 0) {
        throw new LocalMirrorConflictError(result.conflicts);
      }
      const hashes = result.hashes as Record<string, string>;
      const hash = hashes[file.path];
      if (!hash) throw new Error(`Mirror helper did not hash ${file.path}`);
      manifestFiles[file.path] = {
        kind: file.kind,
        sha256: hash,
        docId: file.docId,
        sourceHash: file.sourceHash,
      };
    }
  }

  private async writeSerializedDocument(
    token: number,
    generation: string,
    projectRoot: string,
    doc: Store,
    serialized: LocalMirrorSerializedDocument,
    manifestFiles: LocalMirrorManifest['files'],
    replaceConflicts: boolean
  ) {
    await this.writeFiles(
      token,
      generation,
      projectRoot,
      serialized.files,
      manifestFiles,
      replaceConflicts
    );
    for (const asset of serialized.assets) {
      this.assertCanRun(token);
      const blob = await doc.blobSync.get(asset.assetId);
      if (!blob) {
        throw new Error(
          `Document ${serialized.docId} references unavailable asset ${asset.assetId}`
        );
      }
      const file = await materializeLocalMirrorAsset(asset, blob);
      this.assertCanRun(token);
      await this.writeFiles(
        token,
        generation,
        projectRoot,
        [file],
        manifestFiles,
        replaceConflicts
      );
    }
  }

  private async startGeneration(projectRoot: string, generation: string) {
    await this.abortActiveGeneration();
    const controller = new AbortController();
    this.activeAbort = controller;
    const result = await this.desktopApi.handler.mirror.beginGeneration({
      projectRoot,
      workspaceId: this.workspace.id,
      generation,
    });
    if (controller.signal.aborted) {
      await this.desktopApi.handler.mirror.abortGeneration({
        lease: result.lease,
      });
      throw new DOMException('Mirror generation aborted', 'AbortError');
    }
    this.activeLease = result.lease;
    return controller.signal;
  }

  private async abortActiveGeneration() {
    this.activeAbort?.abort();
    this.activeAbort = null;
    const lease = this.activeLease;
    this.activeLease = null;
    if (lease) await this.desktopApi.handler.mirror.abortGeneration({ lease });
  }

  private async reconcile(replaceConflicts: boolean) {
    const token = this.generationToken;
    const projectRoot = this.config.projectRoot;
    if (!projectRoot) return;
    this.assertCanRun(token);
    const readiness = new AbortController();
    this.activeAbort = readiness;
    await this.workspace.engine.doc.waitForDocLoaded(
      this.workspace.id,
      readiness.signal
    );
    this.assertCanRun(token);
    const inspection = await this.desktopApi.handler.mirror.inspectTarget({
      projectRoot,
      workspaceId: this.workspace.id,
      recoverInterrupted: true,
    });
    if (inspection.state === 'foreign') {
      throw new Error(
        'The selected .affine folder belongs to another workspace'
      );
    }
    if (inspection.state === 'unowned') {
      throw new Error('The selected .affine folder contains unmanaged files');
    }
    this.assertCanRun(token);

    const generation = nanoid();
    const signal = await this.startGeneration(projectRoot, generation);
    const generatedAt = new Date().toISOString();
    const records = [...this.docs.list.docs$.value].sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    const metadata: LocalMirrorDocMetadata[] = records.map(record => ({
      id: record.id,
      title: record.title$.value,
      createDate: record.createdAt$.value,
      updatedDate: record.updatedAt$.value,
      trash: record.trash$.value,
      tags: record.meta$.value.tags ?? [],
      primaryMode: record.primaryMode$.value,
      properties: record.properties$.value,
    }));
    const docPaths = createMirrorDocPathMap(metadata);
    const files: LocalMirrorManifest['files'] = {};
    this.status$.setValue({
      type: 'syncing',
      completed: 0,
      total: records.length,
    });

    for (let index = 0; index < records.length; index++) {
      this.assertCanRun(token);
      const record = records[index];
      const opened = this.docs.open(record.id);
      const releasePriority = opened.doc.addPriorityLoad(100);
      try {
        await opened.doc.waitForSyncReady(signal);
        this.assertCanRun(token);
        const serialized = await this.serializer.serialize(
          opened.doc.blockSuiteDoc,
          metadata[index],
          docPaths
        );
        await this.writeSerializedDocument(
          token,
          generation,
          projectRoot,
          opened.doc.blockSuiteDoc,
          serialized,
          files,
          replaceConflicts
        );
      } finally {
        releasePriority();
        opened.release();
      }
      this.status$.setValue({
        type: 'syncing',
        completed: index + 1,
        total: records.length,
      });
    }

    const folders = this.workspaceDB.db.folders.find().map(folder => ({
      ...folder,
      parentId: folder.parentId ?? null,
    }));
    const tags = this.tagService.tagList.tagMetas$.value.map(tag => ({
      id: tag.id,
      value: tag.name,
      color: tag.color,
    }));
    const projection = createLocalMirrorProjection({
      workspace: {
        id: this.workspace.id,
        name: this.workspace.name$.value ?? 'Untitled workspace',
        flavour: this.workspace.flavour,
      },
      generatedAt,
      docs: metadata,
      docPaths,
      folders,
      tags,
    });
    await this.writeFiles(
      token,
      generation,
      projectRoot,
      [
        { path: 'index.md', kind: 'index', content: projection.indexMarkdown },
        {
          path: LOCAL_MIRROR_WORKSPACE_PATH,
          kind: 'workspace',
          content: projection.workspaceJson,
        },
      ],
      files,
      replaceConflicts
    );
    this.assertCanRun(token);

    const engineState = await firstValueFrom(
      this.workspace.engine.doc.state$.pipe(take(1))
    );
    const sourceState = engineState.synced ? 'synced' : 'cached-offline';
    const manifest = LocalMirrorManifestSchema.parse({
      formatVersion: 1,
      workspaceId: this.workspace.id,
      workspaceFlavour: this.workspace.flavour,
      generation,
      lastCompletedAt: generatedAt,
      sourceSyncState: sourceState,
      files,
    });
    const stalePaths = Object.keys(inspection.manifest?.files ?? {}).filter(
      path => !files[path]
    );
    this.assertCanRun(token);
    const activeLease = this.activeLease;
    if (!activeLease)
      throw new DOMException('Mirror generation aborted', 'AbortError');
    const final = await this.desktopApi.handler.mirror.finalizeGeneration({
      lease: activeLease,
      projectRoot,
      workspaceId: this.workspace.id,
      manifest,
      stalePaths,
      replaceConflicts,
    });
    if (final.conflicts.length > 0) {
      throw new LocalMirrorConflictError(final.conflicts);
    }
    this.activeLease = null;
    this.activeAbort = null;
    this.assertCanRun(token);
    this.status$.setValue({ type: 'idle', lastCompletedAt: generatedAt });
  }

  private async reconcileDocuments(
    changedDocIds: string[],
    replaceConflicts: boolean
  ) {
    const token = this.generationToken;
    const projectRoot = this.config.projectRoot;
    if (!projectRoot) return;
    this.assertCanRun(token);
    const readiness = new AbortController();
    this.activeAbort = readiness;
    await this.workspace.engine.doc.waitForDocLoaded(
      this.workspace.id,
      readiness.signal
    );
    this.assertCanRun(token);
    const inspection = await this.desktopApi.handler.mirror.inspectTarget({
      projectRoot,
      workspaceId: this.workspace.id,
      recoverInterrupted: true,
    });
    if (inspection.state !== 'owned' || !inspection.manifest) {
      await this.reconcile(replaceConflicts);
      return;
    }
    this.assertCanRun(token);

    const generatedAt = new Date().toISOString();
    const records = [...this.docs.list.docs$.value].sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    const metadata: LocalMirrorDocMetadata[] = records.map(record => ({
      id: record.id,
      title: record.title$.value,
      createDate: record.createdAt$.value,
      updatedDate: record.updatedAt$.value,
      trash: record.trash$.value,
      tags: record.meta$.value.tags ?? [],
      primaryMode: record.primaryMode$.value,
      properties: record.properties$.value,
    }));
    const docPaths = createMirrorDocPathMap(metadata);
    if (haveMirrorDocumentPathsChanged(inspection.manifest, docPaths)) {
      await this.reconcile(replaceConflicts);
      return;
    }
    const generation = nanoid();
    const signal = await this.startGeneration(projectRoot, generation);
    const recordsById = new Map(records.map(record => [record.id, record]));
    const metadataById = new Map(metadata.map(doc => [doc.id, doc]));
    const files: LocalMirrorManifest['files'] = {
      ...inspection.manifest.files,
    };
    const stalePaths = new Set<string>();
    this.status$.setValue({
      type: 'syncing',
      completed: 0,
      total: changedDocIds.length,
    });

    for (let index = 0; index < changedDocIds.length; index++) {
      const docId = changedDocIds[index];
      this.assertCanRun(token);
      const record = recordsById.get(docId);
      const existingDocEntries = Object.entries(files).filter(
        ([, file]) => file.docId === docId
      );
      const existingDocPaths = existingDocEntries.map(([path]) => path);
      const hasExistingAssets = existingDocEntries.some(
        ([, file]) => file.kind === 'asset'
      );
      if (!record) {
        if (hasExistingAssets) {
          await this.abortActiveGeneration();
          await this.reconcile(replaceConflicts);
          return;
        }
        for (const path of existingDocPaths) {
          delete files[path];
          stalePaths.add(path);
        }
      } else {
        const docMetadata = metadataById.get(docId);
        if (!docMetadata) throw new Error(`Missing metadata for ${docId}`);
        const opened = this.docs.open(docId);
        const releasePriority = opened.doc.addPriorityLoad(100);
        let requiresFullReconciliation = false;
        try {
          await opened.doc.waitForSyncReady(signal);
          this.assertCanRun(token);
          const serialized = await this.serializer.serialize(
            opened.doc.blockSuiteDoc,
            docMetadata,
            docPaths
          );
          if (hasExistingAssets || serialized.assets.length > 0) {
            requiresFullReconciliation = true;
          } else {
            const nextPaths = new Set(serialized.files.map(file => file.path));
            for (const path of existingDocPaths) {
              if (!nextPaths.has(path)) {
                delete files[path];
                stalePaths.add(path);
              }
            }
            await this.writeSerializedDocument(
              token,
              generation,
              projectRoot,
              opened.doc.blockSuiteDoc,
              serialized,
              files,
              replaceConflicts
            );
          }
        } finally {
          releasePriority();
          opened.release();
        }
        if (requiresFullReconciliation) {
          await this.abortActiveGeneration();
          await this.reconcile(replaceConflicts);
          return;
        }
      }
      this.status$.setValue({
        type: 'syncing',
        completed: index + 1,
        total: changedDocIds.length,
      });
    }

    const folders = this.workspaceDB.db.folders.find().map(folder => ({
      ...folder,
      parentId: folder.parentId ?? null,
    }));
    const tags = this.tagService.tagList.tagMetas$.value.map(tag => ({
      id: tag.id,
      value: tag.name,
      color: tag.color,
    }));
    const projection = createLocalMirrorProjection({
      workspace: {
        id: this.workspace.id,
        name: this.workspace.name$.value ?? 'Untitled workspace',
        flavour: this.workspace.flavour,
      },
      generatedAt,
      docs: metadata,
      docPaths,
      folders,
      tags,
    });
    await this.writeFiles(
      token,
      generation,
      projectRoot,
      [
        { path: 'index.md', kind: 'index', content: projection.indexMarkdown },
        {
          path: LOCAL_MIRROR_WORKSPACE_PATH,
          kind: 'workspace',
          content: projection.workspaceJson,
        },
      ],
      files,
      replaceConflicts
    );
    const engineState = await firstValueFrom(
      this.workspace.engine.doc.state$.pipe(take(1))
    );
    const manifest = LocalMirrorManifestSchema.parse({
      ...inspection.manifest,
      generation,
      lastCompletedAt: generatedAt,
      sourceSyncState: engineState.synced ? 'synced' : 'cached-offline',
      files,
    });
    this.assertCanRun(token);
    const activeLease = this.activeLease;
    if (!activeLease)
      throw new DOMException('Mirror generation aborted', 'AbortError');
    const final = await this.desktopApi.handler.mirror.finalizeGeneration({
      lease: activeLease,
      projectRoot,
      workspaceId: this.workspace.id,
      manifest,
      stalePaths: [...stalePaths],
      replaceConflicts,
    });
    if (final.conflicts.length > 0) {
      throw new LocalMirrorConflictError(final.conflicts);
    }
    this.activeLease = null;
    this.activeAbort = null;
    this.assertCanRun(token);
    this.status$.setValue({ type: 'idle', lastCompletedAt: generatedAt });
  }

  async selectProjectRoot() {
    if (!this.featureFlags.flags.enable_local_workspace_mirror.value) {
      throw new Error('Local workspace mirror experiment is disabled');
    }
    if (!this.permissionGranted()) throw new Error('Export permission denied');
    const result =
      await this.desktopApi.handler.mirror.selectProjectDirectory();
    if (result.canceled) return false;
    const inspection = await this.desktopApi.handler.mirror.inspectTarget({
      projectRoot: result.projectRoot,
      workspaceId: this.workspace.id,
    });
    if (inspection.state === 'foreign' || inspection.state === 'unowned') {
      throw new Error('The selected .affine folder cannot be adopted');
    }
    this.localState.set<LocalMirrorConfig>(CONFIG_KEY, {
      ...this.config,
      projectRoot: result.projectRoot,
    });
    return true;
  }

  setEnabled(enabled: boolean) {
    if (
      enabled &&
      !this.featureFlags.flags.enable_local_workspace_mirror.value
    ) {
      throw new Error('Local workspace mirror experiment is disabled');
    }
    if (enabled && !this.permissionGranted()) {
      throw new Error('Export permission denied');
    }
    this.localState.set<LocalMirrorConfig>(CONFIG_KEY, {
      ...this.config,
      enabled,
    });
  }

  syncNow() {
    const reason = this.runtimeReason();
    if (reason) throw new Error(`Local mirror is not runnable: ${reason.type}`);
    this.scheduleReconciliation(0, false, true);
  }

  replaceLocalChanges() {
    const reason = this.runtimeReason();
    if (reason) throw new Error(`Local mirror is not runnable: ${reason.type}`);
    this.scheduleReconciliation(0, true, true);
  }

  async revealMirror() {
    const reason = this.runtimeReason();
    if (reason) throw new Error(`Local mirror is not runnable: ${reason.type}`);
    const projectRoot = this.config.projectRoot;
    if (!projectRoot) throw new Error('No mirror destination selected');
    await this.desktopApi.handler.mirror.revealMirror({
      projectRoot,
      workspaceId: this.workspace.id,
    });
  }

  override dispose() {
    this.stopRuntime({ type: 'disabled' });
    super.dispose();
  }
}
