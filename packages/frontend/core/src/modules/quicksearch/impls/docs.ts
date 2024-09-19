import type { DocRecord, DocsService } from '@toeverything/infra';
import {
  effect,
  Entity,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { truncate } from 'lodash-es';
import { EMPTY, map, mergeMap, of, switchMap } from 'rxjs';

import type { DocDisplayMetaService } from '../../doc-display-meta';
import type { DocsSearchService } from '../../docs-search';
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
    private readonly docDisplayMetaService: DocDisplayMetaService
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
        out = this.docsSearchService.search$(query).pipe(
          map(docs =>
            docs
              .map(doc => {
                const docRecord = this.docsService.list.doc$(doc.docId).value;
                return [doc, docRecord] as const;
              })
              .filter(
                (props): props is [(typeof props)[0], DocRecord] => !!props[1]
              )
              .map(([doc, docRecord]) => {
                const { title, icon, updatedDate } =
                  this.docDisplayMetaService.getDocDisplayMeta(
                    docRecord,
                    'title' in doc ? doc.title : undefined
                  );
                return {
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
                    title: title,
                    subTitle: doc.blockContent,
                  },
                  score: doc.score,
                  icon,
                  timestamp: updatedDate,
                  payload: doc,
                } as QuickSearchItem<'docs', DocsPayload>;
              })
          )
        );
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
