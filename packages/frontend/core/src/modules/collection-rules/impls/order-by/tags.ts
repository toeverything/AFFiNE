import type { DocsService } from '@affine/core/modules/doc';
import type { TagService } from '@affine/core/modules/tag';
import { Service } from '@toeverything/infra';
import { combineLatest, map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class TagsOrderByProvider extends Service implements OrderByProvider {
  constructor(
    private readonly docsService: DocsService,
    private readonly tagService: TagService
  ) {
    super();
  }

  orderBy$(
    _items$: Observable<Set<string>>,
    params: OrderByParams
  ): Observable<string[]> {
    const isDesc = params.desc;
    return combineLatest([
      this.tagService.tagList.tags$.map(tags => new Set(tags.map(t => t.id))),
      this.docsService.allDocsTagIds$(),
    ]).pipe(
      map(([existsTags, docs]) =>
        docs
          .map(doc => {
            const filteredTags = doc.tags
              .filter(tag => existsTags.has(tag)) // filter out tags that don't exist
              .sort() // sort tags by ids
              .join(','); // convert to string
            return [doc.id, filteredTags];
          })
          .sort(
            (a, b) =>
              (a[1] === b[1] ? 0 : a[1] > b[1] ? 1 : -1) * (isDesc ? -1 : 1)
          )
          .map(i => i[0])
      )
    );
  }
}
