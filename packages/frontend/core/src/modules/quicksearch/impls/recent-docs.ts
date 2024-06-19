import { EdgelessIcon, PageIcon, TodayIcon } from '@blocksuite/icons/rc';
import { Entity, LiveData } from '@toeverything/infra';

import type { WorkspacePropertiesAdapter } from '../../properties';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { RecentDocsService } from '../services/recent-pages';
import type { QuickSearchGroup } from '../types/group';
import type { QuickSearchItem } from '../types/item';

const group = {
  id: 'recent-docs',
  label: {
    key: 'com.affine.cmdk.affine.category.affine.recent',
  },
  score: 15,
} as QuickSearchGroup;

export class RecentDocsQuickSearchSession
  extends Entity
  implements QuickSearchSession<'recent-doc', { docId: string }>
{
  constructor(
    private readonly recentDocsService: RecentDocsService,
    private readonly propertiesAdapter: WorkspacePropertiesAdapter
  ) {
    super();
  }

  query$ = new LiveData('');

  items$: LiveData<QuickSearchItem<'recent-doc', { docId: string }>[]> =
    LiveData.computed(get => {
      const query = get(this.query$);

      if (query) {
        return []; /* recent docs only for empty query */
      }

      const docRecords = this.recentDocsService.getRecentDocs();

      return docRecords.map<QuickSearchItem<'recent-doc', { docId: string }>>(
        docRecord => {
          const icon = this.propertiesAdapter.getJournalPageDateString(
            docRecord.id
          ) /* is journal */
            ? TodayIcon
            : docRecord.mode$.value === 'edgeless'
              ? EdgelessIcon
              : PageIcon;

          return {
            id: 'recent-doc:' + docRecord.id,
            source: 'recent-doc',
            group: group,
            label: {
              title: docRecord.meta$.value.title || { key: 'Untitled' },
            },
            score: 0,
            icon,
            timestamp: docRecord.meta$.value.updatedDate,
            payload: { docId: docRecord.id },
          };
        }
      );
    });

  query(query: string) {
    this.query$.next(query);
  }
}
