import { ServerFeature } from '@affine/graphql';
import { SearchIcon } from '@blocksuite/icons/rc';
import {
  effect,
  Entity,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { truncate } from 'lodash-es';
import { catchError, EMPTY, map, of, switchMap, tap, throttleTime } from 'rxjs';

import type { WorkspaceServerService } from '../../cloud';
import type { DocRecord, DocsService } from '../../doc';
import type { DocDisplayMetaService } from '../../doc-display-meta';
import type { DocsSearchService } from '../../docs-search';
import type { FeatureFlagService } from '../../feature-flag';
import type { WorkspaceService } from '../../workspace';
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
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly docsSearchService: DocsSearchService,
    private readonly docsService: DocsService,
    private readonly docDisplayMetaService: DocDisplayMetaService,
    private readonly featureFlagService: FeatureFlagService
  ) {
    super();
  }

  private readonly isSupportServerIndexer = () =>
    this.workspaceServerService.server?.config$.value.features.includes(
      ServerFeature.Indexer
    ) ?? false;

  private readonly isEnableBatterySaveMode = () =>
    this.featureFlagService.flags.enable_battery_save_mode.value;

  private readonly isIndexerLoading$ = this.docsSearchService.indexerState$.map(
    ({ completed }) => {
      return !completed;
    }
  );

  private readonly isQueryLoading$ = new LiveData(false);

  isCloudWorkspace = this.workspaceService.workspace.flavour !== 'local';

  searchLocallyItem = {
    id: 'search-locally',
    source: 'docs',
    label: {
      title: {
        i18nKey: 'com.affine.quicksearch.search-locally',
      },
    },
    score: 1000,
    icon: SearchIcon,
    payload: {
      docId: '',
    },
    beforeSubmit: () => {
      this.searchLocally = true;
      this.query(this.lastQuery);
      return false;
    },
  } as QuickSearchItem<'docs', DocsPayload>;

  isLoading$ = LiveData.computed(get => {
    return (
      (this.isCloudWorkspace ? false : get(this.isIndexerLoading$)) ||
      get(this.isQueryLoading$)
    );
  });

  error$ = new LiveData<any>(null);

  lastQuery = '';

  items$ = new LiveData<QuickSearchItem<'docs', DocsPayload>[]>([]);

  searchLocally = !this.isCloudWorkspace;

  query = effect(
    tap(query => {
      this.lastQuery = query;
    }),
    throttleTime<string>(500, undefined, {
      leading: false,
      trailing: true,
    }),
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
                  this.docDisplayMetaService.getDocDisplayMeta(docRecord);
                return {
                  id: 'doc:' + docRecord.id,
                  source: 'docs',
                  group: {
                    id: 'docs',
                    label: {
                      i18nKey: this.searchLocally
                        ? 'com.affine.quicksearch.group.searchfor-locally'
                        : 'com.affine.quicksearch.group.searchfor',
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
        tap((items: QuickSearchItem<'docs', DocsPayload>[]) => {
          this.items$.next(
            this.isSupportServerIndexer() &&
              !this.searchLocally &&
              !this.isEnableBatterySaveMode()
              ? [...items, this.searchLocallyItem]
              : items
          );
          this.isQueryLoading$.next(false);
        }),
        onStart(() => {
          this.error$.next(null);
          this.items$.next(
            this.isSupportServerIndexer() &&
              !this.searchLocally &&
              !this.isEnableBatterySaveMode()
              ? [this.searchLocallyItem]
              : []
          );
          this.isQueryLoading$.next(true);
        }),
        catchError(err => {
          this.error$.next(err instanceof Error ? err.message : err);
          this.items$.next(
            this.isSupportServerIndexer() &&
              !this.searchLocally &&
              !this.isEnableBatterySaveMode()
              ? [this.searchLocallyItem]
              : []
          );
          this.isQueryLoading$.next(false);
          return EMPTY;
        }),
        onComplete(() => {})
      );
    })
  );

  // TODO(@EYHN): load more

  override dispose(): void {
    this.query.unsubscribe();
  }
}
