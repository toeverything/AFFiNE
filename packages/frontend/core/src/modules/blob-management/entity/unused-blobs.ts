import type { ListedBlobRecord } from '@affine/nbstore';
import {
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { switchMap, tap } from 'rxjs';

import type { DocsSearchService } from '../../docs-search';
import type { WorkspaceService } from '../../workspace';
import type { WorkspaceFlavoursService } from '../../workspace/services/flavours';

export class UnusedBlobs extends Entity {
  constructor(
    private readonly flavoursService: WorkspaceFlavoursService,
    private readonly workspaceService: WorkspaceService,
    private readonly docsSearchService: DocsSearchService
  ) {
    super();
  }

  isLoading$ = new LiveData(false);
  unusedBlobs$ = new LiveData<ListedBlobRecord[]>([]);

  readonly revalidate = effect(
    switchMap(() =>
      fromPromise(async () => {
        return await this.getUnusedBlobs();
      }).pipe(
        tap(data => {
          this.unusedBlobs$.setValue(data);
        }),
        onStart(() => this.isLoading$.setValue(true)),
        onComplete(() => this.isLoading$.setValue(false))
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
    // Wait for both sync and indexing to complete
    await this.workspaceService.workspace.engine.doc.waitForSynced();

    await this.docsSearchService.indexer.waitForCompleted(abortSignal);

    const [blobs, usedBlobs] = await Promise.all([
      this.listManageableBlobs(),
      this.getUsedBlobs(),
    ]);

    // ignore the workspace avatar
    const workspaceAvatar = this.workspaceService.workspace.avatar$.value;

    return (
      blobs?.filter(
        blob => !usedBlobs.includes(blob.key) && blob.key !== workspaceAvatar
      ) ?? []
    );
  }

  private async getUsedBlobs(): Promise<string[]> {
    const limit = 1000;
    const usedBlobs: string[] = [];
    for (let skip = 0; ; skip += limit) {
      const result = await this.docsSearchService.indexer.aggregate(
        'block',
        {
          type: 'boolean',
          occur: 'must',
          queries: [{ type: 'exists', field: 'blob' }],
        },
        'blob',
        { pagination: { limit, skip }, prefer: 'local' }
      );
      usedBlobs.push(...result.buckets.map(bucket => bucket.key));
      if (!result.pagination.hasMore) return usedBlobs;
      if (result.buckets.length === 0) {
        throw new Error('Local blob index pagination did not advance');
      }
    }
  }
}
