export {
  CacheStorage,
  GlobalCache,
  GlobalSessionState,
  GlobalState,
} from './providers/global';
export { NbstoreProvider } from './providers/nbstore';
export {
  GlobalCacheService,
  GlobalSessionStateService,
  GlobalStateService,
} from './services/global';
export { NbstoreService } from './services/nbstore';

import { type Framework } from '@toeverything/infra';

import {
  IDBGlobalState,
  LocalStorageGlobalCache,
  LocalStorageGlobalState,
  SessionStorageGlobalSessionState,
} from './impls/storage';
import {
  CacheStorage,
  GlobalCache,
  GlobalSessionState,
  GlobalState,
} from './providers/global';
import { NbstoreProvider } from './providers/nbstore';
import {
  GlobalCacheService,
  GlobalSessionStateService,
  GlobalStateService,
} from './services/global';
import { NbstoreService } from './services/nbstore';

export const configureStorageModule = (framework: Framework) => {
  framework.service(GlobalStateService, [GlobalState]);
  framework.service(GlobalCacheService, [GlobalCache]);
  framework.service(GlobalSessionStateService, [GlobalSessionState]);
  framework.service(NbstoreService, [NbstoreProvider]);
};

export function configureLocalStorageStateStorageImpls(framework: Framework) {
  framework.impl(GlobalCache, LocalStorageGlobalCache);
  framework.impl(GlobalState, LocalStorageGlobalState);
  framework.impl(CacheStorage, IDBGlobalState);
}

export function configureCommonGlobalStorageImpls(framework: Framework) {
  framework.impl(GlobalSessionState, SessionStorageGlobalSessionState);
}
