import type { DocsService } from '@affine/core/modules/doc';
import type { WorkspacePropertyFilter } from '@affine/core/modules/workspace-property';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class TemplateFilterProvider extends Service implements FilterProvider {
  constructor(private readonly docsService: DocsService) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const method = params.method as WorkspacePropertyFilter<'template'>;
    if (method === 'is') {
      return this.docsService.propertyValues$('isTemplate').pipe(
        map(values => {
          const match = new Set<string>();
          for (const [id, value] of values) {
            if ((value ? 'true' : 'false') === params.value) {
              match.add(id);
            }
          }
          return match;
        })
      );
    } else if (method === 'is-not') {
      return this.docsService.propertyValues$('isTemplate').pipe(
        map(values => {
          const match = new Set<string>();
          for (const [id, value] of values) {
            if ((value ? 'true' : 'false') !== params.value) {
              match.add(id);
            }
          }
          return match;
        })
      );
    }
    throw new Error(`Unsupported method: ${params.method}`);
  }
}
