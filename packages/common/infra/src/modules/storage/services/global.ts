import { Service } from '../../../framework';
import type { GlobalCache, GlobalState } from '../providers/global';

export class GlobalStateService extends Service {
  constructor(public readonly globalState: GlobalState) {
    super();
  }
}

export class GlobalCacheService extends Service {
  constructor(public readonly globalCache: GlobalCache) {
    super();
  }
}
