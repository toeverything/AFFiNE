import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class EdgelessThemeGroupByProvider
  extends Service
  implements GroupByProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  groupBy$(
    _items$: Observable<Set<string>>,
    _params: GroupByParams
  ): Observable<Map<string, Set<string>>> {
    return this.docsService.propertyValues$('edgelessColorTheme').pipe(
      map(values => {
        const result = new Map<string, Set<string>>();
        for (const [id, value] of values) {
          const theme = value ?? 'system';
          if (!result.has(theme)) {
            result.set(theme, new Set([id]));
          } else {
            result.get(theme)?.add(id);
          }
        }
        return result;
      })
    );
  }
}
