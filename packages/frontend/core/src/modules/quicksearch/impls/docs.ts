import { EdgelessIcon, PageIcon, TodayIcon } from '@blocksuite/icons/rc';
import type { DocsService } from '@toeverything/infra';
import {
  effect,
  Entity,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { truncate } from 'lodash-es';
import { EMPTY, map, mergeMap, of, switchMap } from 'rxjs';

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
    private readonly docsSearchService: DocsSearchService,
    private readonly docsService: DocsService,
    private readonly propertiesAdapter: WorkspacePropertiesAdapter
  ) {
    super();
  }

  private readonly isIndexerLoading$ =
    this.docsSearchService.indexer.status$.map(({ remaining }) => {
      return remaining === undefined || remaining > 0;
    });

  private readonly isQueryLoading$ = new LiveData(false);

  isLoading$ = LiveData.computed(get => {
    return get(this.isIndexerLoading$) || get(this.isQueryLoading$);
  });

  query$ = new LiveData('');

  items$ = new LiveData<QuickSearchItem<'docs', DocsPayload>[]>([]);

  query = effect(
    switchMap((query: string) => {
      let out;
      if (!query) {
        out = of([] as QuickSearchItem<'docs', DocsPayload>[]);
      } else {
        const maybeLink = resolveLinkToDoc(query);
        const docRecord = maybeLink
          ? this.docsService.list.doc$(maybeLink.docId).value
          : null;

        if (docRecord) {
          const docMode = docRecord?.mode$.value;
          const icon = this.propertiesAdapter.getJournalPageDateString(
            docRecord.id
          ) /* is journal */
            ? TodayIcon
            : docMode === 'edgeless'
              ? EdgelessIcon
              : PageIcon;

          out = of([
            {
              id: 'doc:' + docRecord.id,
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
                docId: docRecord.id,
              },
            },
          ] as QuickSearchItem<'docs', DocsPayload>[]);
        } else {
          out = this.docsSearchService.search$(query).pipe(
            map(docs =>
              docs.map(doc => {
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
            )
          );
        }
      }
      return out.pipe(
        mergeMap((items: QuickSearchItem<'docs', DocsPayload>[]) => {
          this.items$.next(items);
          this.isQueryLoading$.next(false);
          return EMPTY;
        }),
        onStart(() => {
          this.items$.next([]);
          this.isQueryLoading$.next(true);
        }),
        onComplete(() => {})
      );
    })
  );

  // TODO(@EYHN): load more

  setQuery(query: string) {
    this.query$.next(query);
  }
}
