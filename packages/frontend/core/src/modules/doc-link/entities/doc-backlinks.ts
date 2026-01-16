import {
  catchErrorInto,
  effect,
  Entity,
  exhaustMapWithTrailing,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { tap } from 'rxjs';

import type { DocService, DocsService } from '../../doc';
import type { DocsSearchService } from '../../docs-search';
import type { FeatureFlagService } from '../../feature-flag';
import type { WorkspaceService } from '../../workspace';

export interface Backlink {
  docId: string;
  blockId: string;
  title: string;
  noteBlockId?: string;
  displayMode?: string;
  parentBlockId?: string;
  parentFlavour?: string;
  markdownPreview?: string;
}

export class DocBacklinks extends Entity {
  constructor(
    private readonly docsSearchService: DocsSearchService,
    private readonly docService: DocService,
    private readonly docsService: DocsService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  backlinks$ = new LiveData<Backlink[] | undefined>(undefined);

  isLoading$ = new LiveData<boolean>(false);
  error$ = new LiveData<any>(undefined);

  revalidateFromCloud = effect(
    exhaustMapWithTrailing(() =>
      fromPromise(async () => {
        const searchFromCloud =
          this.featureFlagService.flags.enable_battery_save_mode &&
          this.workspaceService.workspace.flavour !== 'local';
        const { buckets } = await this.docsSearchService.indexer.aggregate(
          'block',
          {
            type: 'boolean',
            occur: 'must',
            queries: [
              {
                type: 'match',
                field: 'refDocId',
                match: this.docService.doc.id,
              },
            ],
          },
          'docId',
          {
            hits: {
              fields: [
                'docId',
                'blockId',
                'parentBlockId',
                'parentFlavour',
                'additional',
                'markdownPreview',
              ],
              pagination: {
                limit: BUILD_CONFIG.isElectron ? 100 : 5, // the max number of backlinks to show for each doc
              },
            },
            pagination: {
              limit: 100,
            },
            prefer: searchFromCloud ? 'remote' : 'local',
          }
        );
        return buckets.flatMap(bucket => {
          const title =
            this.docsService.list.doc$(bucket.key).value?.title$.value ?? '';

          if (bucket.key === this.docService.doc.id) {
            // Ignore if it is a link to the current document.
            return [];
          }

          return bucket.hits.nodes.map(node => {
            const blockId = node.fields.blockId ?? '';
            const markdownPreview = node.fields.markdownPreview ?? '';
            const additional =
              typeof node.fields.additional === 'string'
                ? node.fields.additional
                : node.fields.additional[0];

            const additionalData: {
              displayMode?: string;
              noteBlockId?: string;
            } = JSON.parse(additional || '{}');

            const displayMode = additionalData.displayMode ?? '';
            const noteBlockId = additionalData.noteBlockId ?? '';
            const parentBlockId =
              typeof node.fields.parentBlockId === 'string'
                ? node.fields.parentBlockId
                : node.fields.parentBlockId[0];
            const parentFlavour =
              typeof node.fields.parentFlavour === 'string'
                ? node.fields.parentFlavour
                : node.fields.parentFlavour[0];

            return {
              docId: bucket.key,
              blockId: typeof blockId === 'string' ? blockId : blockId[0],
              title: title,
              markdownPreview:
                typeof markdownPreview === 'string'
                  ? markdownPreview
                  : markdownPreview[0],
              displayMode:
                typeof displayMode === 'string' ? displayMode : displayMode[0],
              noteBlockId:
                typeof noteBlockId === 'string' ? noteBlockId : noteBlockId[0],
              parentBlockId:
                typeof parentBlockId === 'string'
                  ? parentBlockId
                  : parentBlockId[0],
              parentFlavour:
                typeof parentFlavour === 'string'
                  ? parentFlavour
                  : parentFlavour[0],
            };
          });
        });
      }).pipe(
        smartRetry(),
        tap(backlinks => {
          this.backlinks$.value = backlinks;
        }),
        catchErrorInto(this.error$),
        onStart(() => {
          this.isLoading$.value = true;
        }),
        onComplete(() => {
          this.isLoading$.value = false;
        })
      )
    )
  );
}
