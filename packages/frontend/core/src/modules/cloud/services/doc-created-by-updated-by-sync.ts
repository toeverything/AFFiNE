import {
  catchErrorInto,
  effect,
  fromPromise,
  LiveData,
  onStart,
  Service,
  throwIfAborted,
} from '@toeverything/infra';
import { clamp } from 'lodash-es';
import { combineLatest, exhaustMap, finalize, map } from 'rxjs';

import type { DocsService } from '../../doc';
import type { WorkspacePermissionService } from '../../permissions';
import type { WorkspaceService } from '../../workspace';
import type { DocCreatedByUpdatedBySyncStore } from '../stores/doc-created-by-updated-by-sync';

/**
 * This service is used to sync createdBy and updatedBy data from the cloud to local doc properties.
 *
 * # When sync is needed
 *
 * 1. When the user is an owner or admin
 * 2. When the root doc sync is complete
 * 3. When a doc is missing createdBy data
 * 4. When workspace has not been marked as `DocCreatedByUpdatedBySynced`
 */
export class DocCreatedByUpdatedBySyncService extends Service {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly docsService: DocsService,
    private readonly workspacePermissionService: WorkspacePermissionService,
    private readonly docCreatedByUpdatedBySyncStore: DocCreatedByUpdatedBySyncStore
  ) {
    super();
  }

  syncing$ = new LiveData(false);
  error$ = new LiveData<any>(null);
  // sync progress 0.0 - 1.0
  progress$ = new LiveData<number>(0);

  sync = effect(
    exhaustMap(() => {
      return fromPromise(async (signal?: AbortSignal) => {
        let afterCursor: string | null = null;
        let finishedCount = 0;
        while (true) {
          const result =
            await this.docCreatedByUpdatedBySyncStore.getDocCreatedByUpdatedByList(
              afterCursor
            );
          throwIfAborted(signal);

          for (const edge of result.workspace.docs.edges) {
            const docId = edge.node.id;
            const docRecord = this.docsService.list.doc$(docId).value;
            if (docRecord) {
              if (edge.node.creatorId) {
                docRecord.setCreatedBy(edge.node.creatorId);
              }
              if (edge.node.lastUpdaterId) {
                docRecord.setUpdatedBy(edge.node.lastUpdaterId);
              }
            }
            finishedCount++;
          }
          this.progress$.value = clamp(
            finishedCount / result.workspace.docs.totalCount,
            0,
            1
          );
          if (!result.workspace.docs.pageInfo.hasNextPage) {
            break;
          }
          afterCursor = result.workspace.docs.pageInfo.endCursor;
        }

        this.docCreatedByUpdatedBySyncStore.setDocCreatedByUpdatedBySynced(
          true
        );
      }).pipe(
        catchErrorInto(this.error$),
        onStart(() => {
          this.syncing$.value = true;
          this.progress$.value = 0;
          this.error$.value = null;
        }),
        finalize(() => {
          this.syncing$.value = false;
        })
      );
    })
  );

  private readonly workspaceRootDocSynced$ =
    this.workspaceService.workspace.engine.doc
      .docState$(this.workspaceService.workspace.id)
      .pipe(map(doc => doc.synced));

  private readonly isOwnerOrAdmin$ =
    this.workspacePermissionService.permission.isOwnerOrAdmin$;

  private readonly missingCreatedBy$ = this.docsService
    .propertyValues$('createdBy')
    .pipe(
      map(allDocsCreatedBy => {
        let missingCreatedBy = false;
        for (const createdBy of allDocsCreatedBy.values()) {
          if (!createdBy) {
            missingCreatedBy = true;
            break;
          }
        }
        return missingCreatedBy;
      })
    );

  private readonly markedSynced$ =
    this.docCreatedByUpdatedBySyncStore.watchDocCreatedByUpdatedBySynced();

  needSync$ = LiveData.from(
    combineLatest([
      this.workspaceRootDocSynced$,
      this.isOwnerOrAdmin$,
      this.missingCreatedBy$,
      this.markedSynced$,
    ]).pipe(
      map(
        ([
          workspaceRootDocSynced,
          isOwnerOrAdmin,
          missingCreatedBy,
          markedSynced,
        ]) =>
          workspaceRootDocSynced &&
          isOwnerOrAdmin &&
          missingCreatedBy &&
          !markedSynced &&
          this.workspaceService.workspace.flavour !== 'local'
      )
    ),
    false
  );

  override dispose(): void {
    super.dispose();
    this.sync.unsubscribe();
  }
}
