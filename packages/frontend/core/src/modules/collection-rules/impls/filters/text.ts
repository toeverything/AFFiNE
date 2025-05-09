import type { DocsService } from '@affine/core/modules/doc';
import type { WorkspacePropertyFilter } from '@affine/core/modules/workspace-property';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class TextPropertyFilterProvider
  extends Service
  implements FilterProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const method = params.method as WorkspacePropertyFilter<'text'>;
    if (method === 'is') {
      return this.docsService.propertyValues$('custom:' + params.key).pipe(
        map(o => {
          const match = new Set<string>();
          for (const [id, value] of o) {
            if (value === params.value) {
              match.add(id);
            }
          }
          return match;
        })
      );
    } else if (method === 'is-not') {
      return this.docsService.propertyValues$('custom:' + params.key).pipe(
        map(o => {
          const match = new Set<string>();
          for (const [id, value] of o) {
            if (value !== params.value) {
              match.add(id);
            }
          }
          return match;
        })
      );
    } else if (method === 'is-not-empty') {
      return this.docsService.propertyValues$('custom:' + params.key).pipe(
        map(o => {
          const match = new Set<string>();
          for (const [id, value] of o) {
            if (value) {
              match.add(id);
            }
          }
          return match;
        })
      );
    } else if (method === 'is-empty') {
      return this.docsService.propertyValues$('custom:' + params.key).pipe(
        map(o => {
          const match = new Set<string>();
          for (const [id, value] of o) {
            if (!value) {
              match.add(id);
            }
          }
          return match;
        })
      );
    }
    throw new Error(`Unsupported method: ${method}`);
  }
}
