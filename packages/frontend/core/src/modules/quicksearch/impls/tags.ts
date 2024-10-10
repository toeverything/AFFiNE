import { Entity, LiveData } from '@toeverything/infra';
import Fuse from 'fuse.js';

import type { TagService } from '../../tag';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { QuickSearchGroup } from '../types/group';
import type { QuickSearchItem } from '../types/item';
import { highlighter } from '../utils/highlighter';
import { QuickSearchTagIcon } from '../views/tag-icon';

const group: QuickSearchGroup = {
  id: 'tags',
  label: {
    i18nKey: 'com.affine.cmdk.affine.category.affine.tags',
  },
  score: 10,
};

export class TagsQuickSearchSession
  extends Entity
  implements QuickSearchSession<'tags', { tagId: string }>
{
  constructor(private readonly tagService: TagService) {
    super();
  }

  query$ = new LiveData('');

  items$: LiveData<QuickSearchItem<'tags', { tagId: string }>[]> =
    LiveData.computed(get => {
      const query = get(this.query$);

      // has performance issues with `tagList.tagMetas$`
      const tags = get(this.tagService.tagList.tags$).map(tag => ({
        id: tag.id,
        title: get(tag.value$),
        color: get(tag.color$),
      }));

      const fuse = new Fuse(tags, {
        keys: ['title'],
        includeMatches: true,
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.0,
      });

      const result = fuse.search(query);

      return result.map<QuickSearchItem<'tags', { tagId: string }>>(
        ({ item, matches, score = 1 }) => {
          const normalizedRange = ([start, end]: [number, number]) =>
            [
              start,
              end +
                1 /* in fuse, the `end` is different from the `substring` */,
            ] as [number, number];
          const titleMatches = matches
            ?.filter(match => match.key === 'title')
            .flatMap(match => match.indices.map(normalizedRange));

          const Icon = () => QuickSearchTagIcon({ color: item.color });

          return {
            id: 'tag:' + item.id,
            source: 'tags',
            label: {
              title: (highlighter(
                item.title,
                '<b>',
                '</b>',
                titleMatches ?? []
              ) ??
                item.title) || {
                i18nKey: 'Untitled',
              },
            },
            group,
            score: 1 - score,
            icon: Icon,
            matches: titleMatches,
            payload: { tagId: item.id },
          };
        }
      );
    });

  query(query: string) {
    this.query$.next(query);
  }
}
