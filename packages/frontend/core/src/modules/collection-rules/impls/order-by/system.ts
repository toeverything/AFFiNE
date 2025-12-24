import { Service } from '@toeverything/infra';
import type { Observable } from 'rxjs';

import { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class SystemOrderByProvider extends Service implements OrderByProvider {
  orderBy$(
    items$: Observable<Set<string>>,
    params: OrderByParams
  ): Observable<string[]> {
    const provider = this.framework.getOptional(
      OrderByProvider('system:' + params.key)
    );
    if (!provider) {
      throw new Error('Unsupported system order by: ' + params.key);
    }
    return provider.orderBy$(items$, params);
  }
}
