import { ViewLayersIcon } from '@blocksuite/icons/rc';
import { Entity, LiveData } from '@toeverything/infra';
import Fuse from 'fuse.js';

import type { CollectionService } from '../../collection';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { QuickSearchGroup } from '../types/group';
import type { QuickSearchItem } from '../types/item';
import { highlighter } from '../utils/highlighter';

const group = {
  id: 'collections',
  label: {
    i18nKey: 'com.affine.cmdk.affine.category.affine.collections',
  },
  score: 10,
} as QuickSearchGroup;

export class CollectionsQuickSearchSession
  extends Entity
  implements QuickSearchSession<'collections', { collectionId: string }>
{
  constructor(private readonly collectionService: CollectionService) {
    super();
  }

  query$ = new LiveData('');

  items$: LiveData<QuickSearchItem<'collections', { collectionId: string }>[]> =
    LiveData.computed(get => {
      const query = get(this.query$);

      const collections = get(this.collectionService.collections$);

      const fuse = new Fuse(collections, {
        keys: ['name'],
        includeMatches: true,
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.0,
      });

      const result = fuse.search(query);

      return result.map<
        QuickSearchItem<'collections', { collectionId: string }>
      >(({ item, matches, score = 1 }) => {
        const nomalizedRange = ([start, end]: [number, number]) =>
          [
            start,
            end + 1 /* in fuse, the `end` is different from the `substring` */,
          ] as [number, number];
        const titleMatches = matches
          ?.filter(match => match.key === 'name')
          .flatMap(match => match.indices.map(nomalizedRange));

        return {
          id: 'collection:' + item.id,
          source: 'collections',
          label: {
            title: (highlighter(item.name, '<b>', '</b>', titleMatches ?? []) ??
              item.name) || {
              i18nKey: 'Untitled',
            },
          },
          group,
          score:
            1 -
            score /* in fuse, the smaller the score, the better the match, so we need to reverse it */,
          icon: ViewLayersIcon,
          payload: { collectionId: item.id },
        };
      });
    });

  query(query: string) {
    this.query$.next(query);
  }
}
