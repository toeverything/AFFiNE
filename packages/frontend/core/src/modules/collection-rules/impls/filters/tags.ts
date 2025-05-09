import type { DocsService } from '@affine/core/modules/doc';
import type { TagService } from '@affine/core/modules/tag';
import { Service } from '@toeverything/infra';
import { combineLatest, map, type Observable, of, switchMap } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class TagsFilterProvider extends Service implements FilterProvider {
  constructor(
    private readonly tagService: TagService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    if (params.method === 'include') {
      const tagIds = params.value?.split(',') ?? [];

      const tags = tagIds.map(id => this.tagService.tagList.tagByTagId$(id));

      if (tags.length === 0) {
        return of(new Set<string>());
      }

      return combineLatest(tags).pipe(
        switchMap(tags =>
          combineLatest(
            tags.filter(tag => tag !== undefined).map(tag => tag.pageIds$)
          ).pipe(map(pageIds => new Set(pageIds.flat())))
        )
      );
    } else if (params.method === 'is-not-empty') {
      return combineLatest([
        this.tagService.tagList.tags$.map(tags => new Set(tags.map(t => t.id))),
        this.docsService.allDocsTagIds$(),
      ]).pipe(
        map(
          ([tags, docs]) =>
            new Set(
              docs
                .filter(
                  // filter deleted tags
                  // oxlint-disable-next-line prefer-array-some
                  doc => doc.tags.filter(tag => tags.has(tag)).length > 0
                )
                .map(doc => doc.id)
            )
        )
      );
    } else if (params.method === 'is-empty') {
      return this.tagService.tagList.tags$
        .map(tags => new Set(tags.map(t => t.id)))
        .pipe(
          switchMap(tags =>
            this.docsService.allDocsTagIds$().pipe(
              map(docs => {
                return new Set(
                  docs
                    .filter(
                      // filter deleted tags
                      // oxlint-disable-next-lint prefer-array-some
                      doc => doc.tags.filter(tag => tags.has(tag)).length === 0
                    )
                    .map(doc => doc.id)
                );
              })
            )
          )
        );
    }
    throw new Error(`Unsupported method: ${params.method}`);
  }
}
