import type { ListedBlobRecord } from '@affine/nbstore';
import {
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { fileTypeFromBuffer } from 'file-type';
import { switchMap, tap } from 'rxjs';

import type { DocsSearchService } from '../../docs-search';
import type { WorkspaceService } from '../../workspace';
import type { WorkspaceFlavoursService } from '../../workspace/services/flavours';

interface HydratedBlobRecord extends ListedBlobRecord, Disposable {
  url: string;
  extension?: string;
  type?: string;
}

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

  async listBlobs() {
    const blobs = await this.flavourProvider?.listBlobs(
      this.workspaceService.workspace.id
    );
    return blobs;
  }

  async getBlob(blobKey: string) {
    const blob = await this.flavourProvider?.getWorkspaceBlob(
      this.workspaceService.workspace.id,
      blobKey
    );
    return blob;
  }

  async deleteBlob(blob: string, permanent: boolean) {
    await this.flavourProvider?.deleteBlob(
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
      this.listBlobs(),
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
    const result = await this.docsSearchService.indexer.aggregate(
      'block',
      {
        type: 'boolean',
        occur: 'must',
        queries: [
          {
            type: 'exists',
            field: 'blob',
          },
        ],
      },
      'blob',
      {
        pagination: {
          limit: Number.MAX_SAFE_INTEGER,
        },
      }
    );

    return result.buckets.map(bucket => bucket.key);
  }

  async hydrateBlob(
    record: ListedBlobRecord,
    abortSignal?: AbortSignal
  ): Promise<HydratedBlobRecord | null> {
    const blob = await this.getBlob(record.key);

    if (!blob || abortSignal?.aborted) {
      return null;
    }

    const fileType = await fileTypeFromBuffer(await blob.arrayBuffer());

    if (abortSignal?.aborted) {
      return null;
    }

    const mime = record.mime || fileType?.mime || 'unknown';
    const url = URL.createObjectURL(new Blob([blob], { type: mime }));
    // todo(@pengx17): the following may not be sufficient
    const extension = fileType?.ext;
    const type = extension ?? (mime?.startsWith('text/') ? 'txt' : 'unknown');
    return {
      ...record,
      url,
      extension,
      type,
      mime,
      [Symbol.dispose]: () => {
        URL.revokeObjectURL(url);
      },
    };
  }
}
