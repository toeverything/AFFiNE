import { getDocSummaryQuery } from '@affine/graphql';
import { Store } from '@toeverything/infra';
import { map, Observable } from 'rxjs';

import type { WorkspaceServerService } from '../../cloud';
import type { CacheStorage } from '../../storage';
import type { WorkspaceService } from '../../workspace';

export class DocSummaryStore extends Store {
  get indexer() {
    return this.workspaceService.workspace.engine.indexer;
  }

  private readonly gql = this.workspaceServerService.server?.gql;

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly cacheStorage: CacheStorage
  ) {
    super();
  }

  async getDocSummaryFromCloud(docId: string) {
    return this.gql?.({
      query: getDocSummaryQuery,
      variables: {
        workspaceId: this.workspaceService.workspace.id,
        docId,
      },
    }).then(res => res.workspace.doc.summary ?? '');
  }

  watchDocSummaryFromIndexer(docId: string) {
    return new Observable<string>(subscribe => {
      const undoIndexer = this.indexer.addPriority(docId, 10);
      const undoSync = this.workspaceService.workspace.engine.doc.addPriority(
        docId,
        10
      );
      const sub = this.indexer
        .search$(
          'doc',
          {
            type: 'match',
            field: 'docId',
            match: docId,
          },
          {
            fields: ['summary'],
            pagination: {
              limit: 1,
            },
          }
        )
        .pipe(
          map(({ nodes }) => {
            const node = nodes.at(0);
            return (
              (typeof node?.fields.summary === 'string'
                ? node?.fields.summary
                : node?.fields.summary[0]) ?? ''
            );
          })
        )
        .subscribe(subscribe);
      return () => {
        undoIndexer();
        undoSync();
        sub.unsubscribe();
      };
    });
  }

  async setDocSummaryCache(docId: string, summary: string) {
    return this.cacheStorage.set(
      `doc-summary:${this.workspaceService.workspace.id}:${docId}`,
      summary
    );
  }

  watchDocSummaryCache(docId: string) {
    return this.cacheStorage.watch<string>(
      `doc-summary:${this.workspaceService.workspace.id}:${docId}`
    );
  }
}
