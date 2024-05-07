export { GlobalCache, GlobalState } from './providers/global';
export { GlobalCacheService, GlobalStateService } from './services/global';

import type { Framework } from '../../framework';
import { MemoryMemento } from '../../storage';
import { GlobalCache, GlobalState } from './providers/global';
import { GlobalCacheService, GlobalStateService } from './services/global';

export const configureGlobalStorageModule = (framework: Framework) => {
  framework.service(GlobalStateService, [GlobalState]);
  framework.service(GlobalCacheService, [GlobalCache]);
};

export const configureTestingGlobalStorage = (framework: Framework) => {
  framework.impl(GlobalCache, MemoryMemento);
  framework.impl(GlobalState, MemoryMemento);
};
