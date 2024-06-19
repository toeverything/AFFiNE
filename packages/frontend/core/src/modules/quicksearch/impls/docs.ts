import { EdgelessIcon, PageIcon, TodayIcon } from '@blocksuite/icons/rc';
import type { DocsService, WorkspaceService } from '@toeverything/infra';
import {
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { truncate } from 'lodash-es';
import { EMPTY, mergeMap, switchMap } from 'rxjs';

import type { DocsSearchService } from '../../docs-search';
import { resolveLinkToDoc } from '../../navigation';
import type { WorkspacePropertiesAdapter } from '../../properties';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { QuickSearchItem } from '../types/item';

interface DocsPayload {
  docId: string;
  title?: string;
  blockId?: string | undefined;
  blockContent?: string | undefined;
}

export class DocsQuickSearchSession
  extends Entity
  implements QuickSearchSession<'docs', DocsPayload>
{
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly docSearchService: DocsSearchService,
    private readonly docsService: DocsService,
    private readonly propertiesAdapter: WorkspacePropertiesAdapter
  ) {
    super();
  }

  query$ = new LiveData('');

  isLoading$ = new LiveData(false);

  loadingProgress$ = new LiveData(0);

  items$ = new LiveData<QuickSearchItem<'docs', DocsPayload>[]>([]);

  query = effect(
    switchMap((query: string) => {
      return fromPromise(async () => {
        if (!query) {
          return [];
        }

        const maybeLink = resolveLinkToDoc(query);

        let result: QuickSearchItem<'docs', DocsPayload>[] = [];
        if (
          maybeLink &&
          maybeLink.workspaceId === this.workspaceService.workspace.id
        ) {
          const docRecord = this.docsService.list.doc$(maybeLink.docId).value;
          if (docRecord) {
            const docMode = docRecord?.mode$.value;
            const icon = this.propertiesAdapter.getJournalPageDateString(
              maybeLink.docId
            ) /* is journal */
              ? TodayIcon
              : docMode === 'edgeless'
                ? EdgelessIcon
                : PageIcon;

            result = [
              {
                id: 'doc:' + maybeLink.docId,
                source: 'docs',
                group: {
                  id: 'docs',
                  label: {
                    key: 'com.affine.quicksearch.group.searchfor',
                    options: { query: truncate(query) },
                  },
                  score: 5,
                },
                label: {
                  title: docRecord.title$.value || { key: 'Untitled' },
                },
                score: 100,
                icon,
                timestamp: docRecord.meta$.value.updatedDate,
                payload: {
                  docId: maybeLink.docId,
                },
              },
            ];
          }
        }

        const docs = await this.docSearchService.search(query);

        result.push(
          ...docs.map(doc => {
            const docRecord = this.docsService.list.doc$(doc.docId).value;
            const docMode = docRecord?.mode$.value;
            const updatedTime = docRecord?.meta$.value.updatedDate;

            const icon = this.propertiesAdapter.getJournalPageDateString(
              doc.docId
            ) /* is journal */
              ? TodayIcon
              : docMode === 'edgeless'
                ? EdgelessIcon
                : PageIcon;

            return {
              id: 'doc:' + doc.docId,
              source: 'docs',
              group: {
                id: 'docs',
                label: {
                  key: 'com.affine.quicksearch.group.searchfor',
                  options: { query: truncate(query) },
                },
                score: 5,
              },
              label: {
                title: doc.title || { key: 'Untitled' },
                subTitle: doc.blockContent,
              },
              score: doc.score,
              icon,
              timestamp: updatedTime,
              payload: doc,
            } as QuickSearchItem<'docs', DocsPayload>;
          })
        );

        return result;
      }).pipe(
        mergeMap((items: QuickSearchItem<'docs', DocsPayload>[]) => {
          this.items$.next(items);
          return EMPTY;
        }),
        onStart(() => {
          this.items$.next([]);
          // loading
        }),
        onComplete(() => {})
      );
    })
  );

  // TODO: load more

  setQuery(query: string) {
    this.query$.next(query);
  }
}
