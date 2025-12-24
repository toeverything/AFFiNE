import type { DocsService } from '@affine/core/modules/doc';
import type { WorkspacePropertyFilter } from '@affine/core/modules/workspace-property';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class NumberPropertyFilterProvider
  extends Service
  implements FilterProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const method = params.method as WorkspacePropertyFilter<'number'>;
    const values$ = this.docsService.propertyValues$('custom:' + params.key);
    const filterValue = Number(params.value);
    if (method === 'is-not-empty') {
      return values$.pipe(
        map(o => {
          const match = new Set<string>();
          for (const [id, value] of o) {
            if (value !== undefined && value !== null && value !== '') {
              match.add(id);
            }
          }
          return match;
        })
      );
    } else if (method === 'is-empty') {
      return values$.pipe(
        map(o => {
          const match = new Set<string>();
          for (const [id, value] of o) {
            if (value === undefined || value === null || value === '') {
              match.add(id);
            }
          }
          return match;
        })
      );
    } else if (
      method === '=' ||
      method === '≠' ||
      method === '>' ||
      method === '<' ||
      method === '≥' ||
      method === '≤'
    ) {
      return values$.pipe(
        map(o => {
          const match = new Set<string>();
          for (const [id, value] of o) {
            const numValue = Number(value);
            switch (method) {
              case '=':
                if (Math.abs(numValue - filterValue) < Number.EPSILON) {
                  match.add(id);
                }
                break;
              case '≠':
                if (Math.abs(numValue - filterValue) >= Number.EPSILON) {
                  match.add(id);
                }
                break;
              case '>':
                if (numValue > filterValue) {
                  match.add(id);
                }
                break;
              case '<':
                if (numValue < filterValue) {
                  match.add(id);
                }
                break;
              case '≥':
                if (numValue >= filterValue) {
                  match.add(id);
                }
                break;
              case '≤':
                if (numValue <= filterValue) {
                  match.add(id);
                }
                break;
            }
          }
          return match;
        })
      );
    }
    throw new Error(`Unsupported method: ${method}`);
  }
}
