import { Service } from '@toeverything/infra';
import type { Observable } from 'rxjs';

import { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class SystemGroupByProvider extends Service implements GroupByProvider {
  groupBy$(
    items$: Observable<Set<string>>,
    params: GroupByParams
  ): Observable<Map<string, Set<string>>> {
    const provider = this.framework.getOptional(
      GroupByProvider('system:' + params.key)
    );
    if (!provider) {
      throw new Error('Unsupported system group by: ' + params.key);
    }
    return provider.groupBy$(items$, params);
  }
}
