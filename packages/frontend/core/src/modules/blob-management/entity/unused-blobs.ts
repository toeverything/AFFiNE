import { DebugLogger } from '@affine/debug';
import type { ListedBlobRecord } from '@affine/nbstore';
import {
  effect,
  Entity,
  fromPromise,
  LiveData,
  onStart,
} from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import {
  catchError,
  EMPTY,
  finalize,
  firstValueFrom,
  switchMap,
  tap,
} from 'rxjs';
import { applyUpdate, Doc as YDoc, Map as YMap } from 'yjs';

import type { WorkspaceService } from '../../workspace';
import type { WorkspaceFlavoursService } from '../../workspace/services/flavours';

const logger = new DebugLogger('unused-blobs');

export class UnusedBlobs extends Entity {
  constructor(
    private readonly flavoursService: WorkspaceFlavoursService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  isLoading$ = new LiveData(false);
  unusedBlobs$ = new LiveData<ListedBlobRecord[]>([]);

  readonly revalidate = effect(
    switchMap(() =>
      fromPromise(async signal => {
        return await this.getUnusedBlobs(signal);
      }).pipe(
        tap(data => {
          this.unusedBlobs$.setValue(data);
        }),
        catchError(error => {
          logger.error(error);
          return EMPTY;
        }),
        onStart(() => {
          this.unusedBlobs$.setValue([]);
          this.isLoading$.setValue(true);
        }),
        finalize(() => this.isLoading$.setValue(false))
      )
    )
  );

  private get flavourProvider() {
    return this.flavoursService.flavours$.value.find(
      f => f.flavour === this.workspaceService.workspace.flavour
    );
  }

  async listManageableBlobs() {
    const blobs = await this.flavourProvider?.listManageableBlobs(
      this.workspaceService.workspace.id
    );
    return blobs;
  }

  async deleteBlob(blob: string, permanent: boolean) {
    await this.flavourProvider?.deleteManagedBlob(
      this.workspaceService.workspace.id,
      blob,
      permanent
    );
  }

  async getUnusedBlobs(abortSignal?: AbortSignal) {
    await this.workspaceService.workspace.engine.doc.waitForSynced(
      undefined,
      abortSignal
    );

    const blobs = await this.listManageableBlobs();
    const usedBlobs = await this.getUsedBlobs(abortSignal);
    abortSignal?.throwIfAborted();

    return blobs?.filter(blob => !usedBlobs.has(blob.key)) ?? [];
  }

  private async getUsedBlobs(signal?: AbortSignal): Promise<Set<string>> {
    const workspace = this.workspaceService.workspace;
    const frontend = workspace.engine.doc;
    const storage = frontend.storage;
    const inventory =
      workspace.flavour === 'local'
        ? null
        : await firstValueFrom(frontend.workspaceState$);
    if (workspace.flavour !== 'local' && !inventory?.ready) {
      throw new Error('Document inventory is not ready');
    }
    const clocks = await storage.getDocTimestamps();
    const docIds = new Set([
      ...Object.keys(clocks),
      ...(inventory?.docs.map(doc => doc.docId) ?? []),
      ...Object.keys(inventory?.clocks ?? {}),
    ]);
    const usedBlobs = new Set<string>();
    for (const docId of docIds) {
      signal?.throwIfAborted();
      const record = await storage.getDoc(docId);
      if (!record) throw new Error('Document source is unavailable');
      const doc = new YDoc({ guid: docId });
      try {
        applyUpdate(doc, record.bin);
        if (doc.store.pendingStructs || doc.store.pendingDs) {
          throw new Error('Document blob references are incomplete');
        }
        const avatar = doc.getMap('meta').get('avatar');
        if (typeof avatar === 'string' && avatar) usedBlobs.add(avatar);
        for (const block of doc.getMap('blocks').values()) {
          if (!(block instanceof YMap)) continue;
          const flavour = block.get('sys:flavour');
          if (flavour !== 'affine:image' && flavour !== 'affine:attachment') {
            continue;
          }
          const blob = block.get('prop:sourceId');
          if (typeof blob === 'string') usedBlobs.add(blob);
        }
      } finally {
        doc.destroy();
      }
    }
    signal?.throwIfAborted();
    const currentClocks = await storage.getDocTimestamps();
    if (!isEqual(clocks, currentClocks)) {
      throw new Error(
        'Document sources changed while checking blob references'
      );
    }
    if (
      inventory &&
      !isEqual(inventory, await firstValueFrom(frontend.workspaceState$))
    ) {
      throw new Error(
        'Document inventory changed while checking blob references'
      );
    }
    return usedBlobs;
  }
}
