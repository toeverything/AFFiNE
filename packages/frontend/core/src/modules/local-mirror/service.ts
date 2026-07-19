import type { WorkspaceDBService } from '@affine/core/modules/db';
import type { DesktopApiService } from '@affine/core/modules/desktop-api';
import type { DocsService } from '@affine/core/modules/doc';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type {
  GuardService,
  WorkspacePermissionService,
} from '@affine/core/modules/permissions';
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

import {
  createMirrorDocPathMap,
  getMirrorBaselineDescriptorPath,
  getMirrorBaselinePath,
  LOCAL_MIRROR_BLOCK_MARKER_GRAMMAR_VERSION,
  LOCAL_MIRROR_WORKSPACE_PATH,
} from './format';
import { createLocalMirrorProjection } from './projection';
import {
  applyMirrorReconciliation,
  LocalMirrorPermissionError,
  LocalMirrorSourceRaceError,
  parseMirrorMarkdown,
  planMirrorReconciliation,
} from './reconciler';
import type { LocalMirrorSerializer } from './serializer';
import {
  LOCAL_MIRROR_FORMAT_VERSION,
  LOCAL_MIRROR_MAX_FILE_BYTES,
  LocalMirrorBaselineDescriptorSchema,
  type LocalMirrorConfig,
  type LocalMirrorDocMetadata,
  type LocalMirrorFileKind,
  type LocalMirrorManifest,
  LocalMirrorManifestSchema,
  type LocalMirrorManifestV2,
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

class LocalMirrorMigrationConflictError extends LocalMirrorConflictError {
  override name = 'LocalMirrorMigrationConflictError';
}

class LocalMirrorMergeConflictError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string
  ) {
    super(reason);
  }
}

class LocalMirrorUnsupportedChangeError extends Error {
  constructor(
    readonly paths: string[],
    message: string
  ) {
    super(message);
  }
}

class LocalMirrorImportPermissionError extends LocalMirrorPermissionError {
  constructor(
    readonly docId: string,
    readonly path: string
  ) {
    super('Document update permission denied');
  }
}

type LocalMirrorDraftManifestFiles = Record<
  string,
  {
    kind: LocalMirrorFileKind;
    sha256: string;
    docId?: string;
    sourceHash?: string;
  }
>;

export function decodeMirrorText(
  content: Uint8Array | undefined,
  path: string
): string {
  if (!content) {
    throw new LocalMirrorUnsupportedChangeError(
      [path],
      'A managed mirror file was deleted or could not be read'
    );
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    throw new LocalMirrorUnsupportedChangeError(
      [path],
      'A managed mirror file is not valid UTF-8'
    );
  }
}

function completeLocalMirrorV2ManifestFiles(
  files: LocalMirrorDraftManifestFiles
): LocalMirrorManifestV2['files'] {
  return Object.fromEntries(
    Object.entries(files).map(([path, entry]) => {
      if (entry.kind !== 'markdown') return [path, entry];
      if (!entry.docId || !entry.sourceHash) {
        throw new Error(`Missing mirror identity for ${path}`);
      }
      const baselinePath = getMirrorBaselinePath(entry.docId);
      const baseline = files[baselinePath];
      if (!baseline || baseline.kind !== 'baseline') {
        throw new Error(`Missing mirror baseline for ${path}`);
      }
      return [
        path,
        {
          ...entry,
          baselinePath,
          markerGrammarVersion: LOCAL_MIRROR_BLOCK_MARKER_GRAMMAR_VERSION,
          baseMarkdownHash: baseline.sha256,
          baseSourceHash: entry.sourceHash,
        },
      ];
    })
  ) as LocalMirrorManifestV2['files'];
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
  private watcherId: string | null = null;
  private mirrorEventDispose: (() => void) | null = null;
  private inboundDirty = false;
  private readonly importingDocIds = new Set<string>();

  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly permissions: WorkspacePermissionService,
    private readonly workspaceService: WorkspaceService,
    private readonly docs: DocsService,
    private readonly workspaceDB: WorkspaceDBService,
    private readonly tagService: TagService,
    private readonly localState: WorkspaceLocalState,
    private readonly desktopApi: DesktopApiService,
    private readonly serializer: LocalMirrorSerializer,
    private readonly guard: GuardService
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
    this.mirrorEventDispose = this.desktopApi.events.mirror.changed(event => {
      if (
        event.workspaceId === this.workspace.id &&
        event.watcherId === this.watcherId
      ) {
        this.inboundDirty = true;
        this.scheduleReconciliation(750, false, false);
      }
    });
    this.updateDispose = this.workspace.engine.doc.storage.subscribeDocUpdate(
      update => {
        if (this.importingDocIds.has(update.docId)) return;
        if (
          this.importingDocIds.size > 0 &&
          (update.docId === this.workspace.id ||
            update.docId.startsWith('db$') ||
            update.docId.startsWith('userdata$'))
        ) {
          return;
        }
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
    this.mirrorEventDispose?.();
    this.mirrorEventDispose = null;
    this.pending = false;
    this.fullPending = false;
    this.dirtyDocIds.clear();
    this.inboundDirty = false;
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
    const watcherId = this.watcherId;
    this.watcherId = null;
    if (watcherId) {
      Promise.resolve(
        this.desktopApi.handler.mirror.stopWatching({ watcherId })
      ).catch(console.error);
    }
    this.status$.setValue(status);
  }

  private async ensureWatcher(projectRoot: string) {
    if (this.watcherId) return;
    const result = await this.desktopApi.handler.mirror.startWatching({
      projectRoot,
      workspaceId: this.workspace.id,
    });
    if (!this.runtimeActive || this.config.projectRoot !== projectRoot) {
      this.desktopApi.handler.mirror.stopWatching({
        watcherId: result.watcherId,
      });
      return;
    }
    this.watcherId = result.watcherId;
    this.inboundDirty = true;
    this.scheduleReconciliation(0, false, false);
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
          if (this.inboundDirty) {
            const inbound = await this.reconcileInbound();
            if (inbound.completed) {
              this.inboundDirty = false;
              if (full && !inbound.reconciled) {
                this.scheduleReconciliation(0, replaceConflicts, true);
              }
            }
          } else if (full || dirtyDocIds.length === 0) {
            await this.reconcile(replaceConflicts);
          } else {
            await this.reconcileDocuments(dirtyDocIds, replaceConflicts);
          }
        } catch (error) {
          if (error instanceof LocalMirrorMigrationConflictError) {
            this.status$.setValue({
              type: 'migration-conflict',
              paths: error.paths,
            });
          } else if (error instanceof LocalMirrorConflictError) {
            this.status$.setValue({ type: 'conflict', paths: error.paths });
          } else if (error instanceof LocalMirrorMergeConflictError) {
            this.status$.setValue({
              type: 'merge-conflict',
              path: error.path,
              reason: error.reason,
            });
          } else if (error instanceof LocalMirrorUnsupportedChangeError) {
            this.status$.setValue({
              type: 'unsupported-local-change',
              paths: error.paths,
              message: error.message,
            });
          } else if (error instanceof LocalMirrorImportPermissionError) {
            this.status$.setValue({
              type: 'permission-denied',
              docId: error.docId,
              path: error.path,
            });
          } else if (error instanceof LocalMirrorPermissionError) {
            this.status$.setValue({ type: 'permission-denied' });
          } else if (error instanceof LocalMirrorSourceRaceError) {
            this.status$.setValue({
              type: 'external-change-pending',
              message: error.message,
            });
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

  private getMirrorDocuments(sorted = false) {
    const records = [...this.docs.list.docs$.value];
    if (sorted) records.sort((left, right) => left.id.localeCompare(right.id));
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
    return { records, metadata, docPaths: createMirrorDocPathMap(metadata) };
  }

  private createWorkspaceProjection(
    generatedAt: string,
    docs: LocalMirrorDocMetadata[],
    docPaths: ReadonlyMap<string, string>
  ) {
    return createLocalMirrorProjection({
      workspace: {
        id: this.workspace.id,
        name: this.workspace.name$.value ?? 'Untitled workspace',
        flavour: this.workspace.flavour,
      },
      generatedAt,
      docs,
      docPaths,
      folders: this.workspaceDB.db.folders.find().map(folder => ({
        ...folder,
        parentId: folder.parentId ?? null,
      })),
      tags: this.tagService.tagList.tagMetas$.value.map(tag => ({
        id: tag.id,
        value: tag.name,
        color: tag.color,
      })),
    });
  }

  private async writeFiles(
    token: number,
    generation: string,
    projectRoot: string,
    files: LocalMirrorSerializedFile[],
    manifestFiles: LocalMirrorDraftManifestFiles
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
      });
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
    manifestFiles: LocalMirrorDraftManifestFiles
  ) {
    await this.writeFiles(
      token,
      generation,
      projectRoot,
      serialized.files,
      manifestFiles
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
        manifestFiles
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

  private async reconcileInbound(): Promise<{
    completed: boolean;
    reconciled: boolean;
  }> {
    const token = this.generationToken;
    const projectRoot = this.config.projectRoot;
    if (!projectRoot) return { completed: true, reconciled: false };
    this.assertCanRun(token);

    const engineState = await firstValueFrom(
      this.workspace.engine.doc.state$.pipe(take(1))
    );
    if (!engineState.synced) {
      this.status$.setValue({
        type: 'external-change-pending',
        message: 'Local edits will be applied after AFFiNE finishes syncing',
      });
      return { completed: false, reconciled: false };
    }

    const scan = await this.desktopApi.handler.mirror.scanTarget({
      projectRoot,
      workspaceId: this.workspace.id,
      includeContent: true,
    });
    if (scan.state !== 'owned' || !scan.manifest) {
      throw new LocalMirrorUnsupportedChangeError(
        [],
        'The mirror target is no longer owned by this workspace'
      );
    }
    if (scan.manifest.formatVersion !== LOCAL_MIRROR_FORMAT_VERSION) {
      const migration =
        await this.desktopApi.handler.mirror.scanVersion1Migration({
          projectRoot,
          workspaceId: this.workspace.id,
        });
      throw new LocalMirrorMigrationConflictError(migration.conflicts);
    }

    const changedPaths = Object.entries(scan.manifest.files)
      .filter(([path, entry]) => scan.files[path]?.sha256 !== entry.sha256)
      .map(([path]) => path);
    if (changedPaths.length === 0) {
      await this.ensureWatcher(projectRoot);
      this.status$.setValue({
        type: 'idle',
        lastCompletedAt: scan.manifest.lastCompletedAt,
      });
      return { completed: true, reconciled: false };
    }
    const unsupportedPaths = changedPaths.filter(
      path => scan.manifest?.files[path]?.kind !== 'markdown'
    );
    if (unsupportedPaths.length > 0) {
      throw new LocalMirrorUnsupportedChangeError(
        unsupportedPaths,
        'Only existing supported document Markdown can be edited locally'
      );
    }

    const readiness = new AbortController();
    this.activeAbort = readiness;
    await this.workspace.engine.doc.waitForDocLoaded(
      this.workspace.id,
      readiness.signal
    );
    this.assertCanRun(token);

    const { records, metadata, docPaths } = this.getMirrorDocuments();
    const recordsById = new Map(records.map(record => [record.id, record]));
    const metadataById = new Map(metadata.map(doc => [doc.id, doc]));
    const observedLiveHashes: Record<string, string | null> = {};
    this.status$.setValue({
      type: 'importing',
      completed: 0,
      total: changedPaths.length,
    });

    for (const [index, path] of changedPaths.entries()) {
      this.assertCanRun(token);
      const entry = scan.manifest.files[path];
      if (entry.kind !== 'markdown' || !entry.docId) {
        throw new LocalMirrorUnsupportedChangeError(
          [path],
          'The changed file is not an importable document'
        );
      }
      const docId = entry.docId;
      const record = recordsById.get(docId);
      const docMetadata = metadataById.get(docId);
      if (!record || !docMetadata) {
        throw new LocalMirrorUnsupportedChangeError(
          [path],
          'Creating or restoring documents from local files is not supported'
        );
      }
      const descriptorPath = getMirrorBaselineDescriptorPath(docId);
      const descriptorFile = scan.files[descriptorPath];
      let descriptor;
      try {
        descriptor = LocalMirrorBaselineDescriptorSchema.parse(
          JSON.parse(decodeMirrorText(descriptorFile?.content, descriptorPath))
        );
      } catch (error) {
        if (error instanceof LocalMirrorUnsupportedChangeError) throw error;
        throw new LocalMirrorUnsupportedChangeError(
          [descriptorPath],
          'The document baseline descriptor is invalid'
        );
      }
      if (
        descriptor.docId !== docId ||
        descriptor.markdownPath !== path ||
        descriptor.baselinePath !== entry.baselinePath ||
        descriptor.protected
      ) {
        throw new LocalMirrorUnsupportedChangeError(
          [path],
          descriptor.protected
            ? 'This document contains protected content and is read-only in the mirror'
            : 'The document baseline identity does not match the manifest'
        );
      }

      const opened = this.docs.open(docId);
      const releasePriority = opened.doc.addPriorityLoad(100);
      try {
        await this.workspace.engine.doc.waitForDocLoaded(
          docId,
          readiness.signal
        );
        this.assertCanRun(token);
        const remoteSerialized = await this.serializer.serialize(
          opened.doc.blockSuiteDoc,
          docMetadata,
          docPaths
        );
        const remoteFile = remoteSerialized.files.find(
          file => file.kind === 'markdown'
        );
        if (!remoteFile || typeof remoteFile.content !== 'string') {
          throw new Error('AFFiNE did not produce canonical document Markdown');
        }
        const base = parseMirrorMarkdown(
          decodeMirrorText(
            scan.files[entry.baselinePath]?.content,
            entry.baselinePath
          )
        );
        if (
          scan.files[entry.baselinePath]?.sha256 !== entry.baseMarkdownHash ||
          descriptor.sourceHash !== entry.baseSourceHash ||
          base.sourceHash !== entry.baseSourceHash
        ) {
          throw new LocalMirrorUnsupportedChangeError(
            [path],
            'The document baseline controls do not match the manifest'
          );
        }
        let local: ReturnType<typeof parseMirrorMarkdown>;
        try {
          local = parseMirrorMarkdown(
            decodeMirrorText(scan.files[path]?.content, path)
          );
        } catch (error) {
          if (error instanceof LocalMirrorUnsupportedChangeError) throw error;
          throw new LocalMirrorUnsupportedChangeError(
            [path],
            (error as Error).message
          );
        }
        const remote = parseMirrorMarkdown(remoteFile.content);
        const result = planMirrorReconciliation(base, local, remote);
        if (result.type === 'conflict') {
          throw new LocalMirrorMergeConflictError(path, result.reason);
        }
        if (result.type === 'unsupported') {
          throw new LocalMirrorUnsupportedChangeError([path], result.reason);
        }
        if (result.type === 'apply') {
          const structuralOperations = result.operations.filter(
            operation => operation.type !== 'update'
          );
          if (
            descriptor.protectedReasons.length > 0 &&
            structuralOperations.length > 0
          ) {
            throw new LocalMirrorUnsupportedChangeError(
              [path],
              'Only text edits are supported when protected content is present'
            );
          }
          const descriptorBlocksById = new Map(
            descriptor.blocks.map(block => [block.id, block])
          );
          if (
            descriptorBlocksById.size !== descriptor.blocks.length ||
            descriptor.blocks.some(block => {
              const parent = opened.doc.blockSuiteDoc.getModelById(
                block.parentId
              );
              return (
                !parent ||
                parent.flavour !== 'affine:note' ||
                !parent.children.some(child => child.id === block.id)
              );
            })
          ) {
            throw new LocalMirrorUnsupportedChangeError(
              [path],
              'The document body hierarchy changed'
            );
          }
          const parentId = descriptor.blocks[0]?.parentId;
          if (!parentId) {
            throw new LocalMirrorUnsupportedChangeError(
              [path],
              'The document has no editable body blocks'
            );
          }
          if (
            structuralOperations.length > 0 &&
            descriptor.blocks.some(block => block.parentId !== parentId)
          ) {
            throw new LocalMirrorUnsupportedChangeError(
              [path],
              'Structural edits across multiple body notes are unsupported'
            );
          }
          this.importingDocIds.add(docId);
          try {
            try {
              await applyMirrorReconciliation({
                doc: opened.doc.blockSuiteDoc,
                parentId,
                expectedParentIds: new Map(
                  descriptor.blocks.map(block => [block.id, block.parentId])
                ),
                result,
                canUpdate: async () =>
                  this.workspace.flavour === 'local' ||
                  this.guard.can('Doc_Update', docId),
                sourceStillCurrent: async () => {
                  const current = await this.serializer.serialize(
                    opened.doc.blockSuiteDoc,
                    {
                      ...docMetadata,
                      title: record.title$.value,
                      updatedDate: record.updatedAt$.value,
                      trash: record.trash$.value,
                      tags: record.meta$.value.tags ?? [],
                      primaryMode: record.primaryMode$.value,
                      properties: record.properties$.value,
                    },
                    docPaths
                  );
                  return current.sourceHash === remoteSerialized.sourceHash;
                },
                changeTitle: title => opened.doc.changeDocTitle(title),
              });
            } catch (error) {
              if (error instanceof LocalMirrorPermissionError) {
                throw new LocalMirrorImportPermissionError(docId, path);
              }
              throw error;
            }
          } finally {
            this.importingDocIds.delete(docId);
          }
        }
        observedLiveHashes[path] = scan.files[path]?.sha256 ?? null;
      } finally {
        releasePriority();
        opened.release();
      }
      this.status$.setValue({
        type: 'importing',
        completed: index + 1,
        total: changedPaths.length,
      });
    }

    this.assertCanRun(token);
    await this.reconcile(false, observedLiveHashes);
    return { completed: true, reconciled: true };
  }

  private async reconcile(
    replaceConflicts: boolean,
    observedLiveHashes?: Record<string, string | null>
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
    if (inspection.state === 'foreign') {
      throw new Error(
        'The selected .affine folder belongs to another workspace'
      );
    }
    if (inspection.state === 'unowned') {
      throw new Error('The selected .affine folder contains unmanaged files');
    }
    if (
      inspection.state === 'owned' &&
      inspection.manifest?.formatVersion === 1
    ) {
      const migration =
        await this.desktopApi.handler.mirror.scanVersion1Migration({
          projectRoot,
          workspaceId: this.workspace.id,
        });
      if (migration.conflicts.length > 0 && !replaceConflicts) {
        throw new LocalMirrorMigrationConflictError(migration.conflicts);
      }
    }
    if (
      inspection.state === 'owned' &&
      inspection.manifest?.formatVersion === LOCAL_MIRROR_FORMAT_VERSION &&
      !this.watcherId
    ) {
      await this.ensureWatcher(projectRoot);
      this.scheduleReconciliation(0, false, true);
      return;
    }
    this.assertCanRun(token);

    const generation = nanoid();
    const signal = await this.startGeneration(projectRoot, generation);
    const generatedAt = new Date().toISOString();
    const { records, metadata, docPaths } = this.getMirrorDocuments(true);
    const files: LocalMirrorDraftManifestFiles = {};
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
        await this.workspace.engine.doc.waitForDocLoaded(record.id, signal);
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
          files
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

    const projection = this.createWorkspaceProjection(
      generatedAt,
      metadata,
      docPaths
    );
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
      files
    );
    this.assertCanRun(token);

    const engineState = await firstValueFrom(
      this.workspace.engine.doc.state$.pipe(take(1))
    );
    const sourceState = engineState.synced ? 'synced' : 'cached-offline';
    const manifest = LocalMirrorManifestSchema.parse({
      formatVersion: LOCAL_MIRROR_FORMAT_VERSION,
      workspaceId: this.workspace.id,
      workspaceFlavour: this.workspace.flavour,
      generation,
      lastCompletedAt: generatedAt,
      sourceSyncState: sourceState,
      files: completeLocalMirrorV2ManifestFiles(files),
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
      observedLiveHashes,
    });
    if (final.conflicts.length > 0) {
      throw new LocalMirrorConflictError(final.conflicts);
    }
    this.activeLease = null;
    this.activeAbort = null;
    this.assertCanRun(token);
    await this.ensureWatcher(projectRoot);
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
    if (inspection.manifest.formatVersion !== LOCAL_MIRROR_FORMAT_VERSION) {
      await this.reconcile(replaceConflicts);
      return;
    }
    this.assertCanRun(token);

    const generatedAt = new Date().toISOString();
    const { records, metadata, docPaths } = this.getMirrorDocuments(true);
    if (haveMirrorDocumentPathsChanged(inspection.manifest, docPaths)) {
      await this.reconcile(replaceConflicts);
      return;
    }
    const generation = nanoid();
    const signal = await this.startGeneration(projectRoot, generation);
    const recordsById = new Map(records.map(record => [record.id, record]));
    const metadataById = new Map(metadata.map(doc => [doc.id, doc]));
    const files: LocalMirrorDraftManifestFiles = {
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
          await this.workspace.engine.doc.waitForDocLoaded(docId, signal);
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
              files
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

    const projection = this.createWorkspaceProjection(
      generatedAt,
      metadata,
      docPaths
    );
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
      files
    );
    const engineState = await firstValueFrom(
      this.workspace.engine.doc.state$.pipe(take(1))
    );
    const manifest = LocalMirrorManifestSchema.parse({
      ...inspection.manifest,
      generation,
      lastCompletedAt: generatedAt,
      sourceSyncState: engineState.synced ? 'synced' : 'cached-offline',
      files: completeLocalMirrorV2ManifestFiles(files),
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
    await this.ensureWatcher(projectRoot);
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
    if (this.watcherId) this.inboundDirty = true;
    this.scheduleReconciliation(0, false, true);
  }

  replaceLocalChanges() {
    const reason = this.runtimeReason();
    if (reason) throw new Error(`Local mirror is not runnable: ${reason.type}`);
    this.inboundDirty = false;
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
