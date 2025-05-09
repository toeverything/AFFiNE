import type { DocsService } from '@affine/core/modules/doc';
import type { TagService } from '@affine/core/modules/tag';
import { Service } from '@toeverything/infra';
import { combineLatest, map, type Observable } from 'rxjs';

import type { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class TagsGroupByProvider extends Service implements GroupByProvider {
  constructor(
    private readonly docsService: DocsService,
    private readonly tagService: TagService
  ) {
    super();
  }

  groupBy$(
    _items$: Observable<Set<string>>,
    _params: GroupByParams
  ): Observable<Map<string, Set<string>>> {
    return combineLatest([
      this.tagService.tagList.tags$.map(tags => new Set(tags.map(t => t.id))),
      this.docsService.allDocsTagIds$(),
    ]).pipe(
      map(([existsTags, docs]) => {
        const map = new Map<string, Set<string>>();

        for (const { id, tags } of docs) {
          for (const tag of tags) {
            if (!existsTags.has(tag)) {
              continue;
            }
            const set = map.get(tag) ?? new Set();
            set.add(id);
            map.set(tag, set);
          }
        }

        return map;
      })
    );
  }
}
