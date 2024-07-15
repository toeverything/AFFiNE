import { type Framework, GlobalCache, GlobalState } from '@toeverything/infra';

import { ElectronGlobalCache, ElectronGlobalState } from './impls/electron';
import {
  LocalStorageGlobalCache,
  LocalStorageGlobalState,
} from './impls/local-storage';

export function configureLocalStorageStateStorageImpls(framework: Framework) {
  framework.impl(GlobalCache, LocalStorageGlobalCache);
  framework.impl(GlobalState, LocalStorageGlobalState);
}

export function configureElectronStateStorageImpls(framework: Framework) {
  framework.impl(GlobalCache, ElectronGlobalCache);
  framework.impl(GlobalState, ElectronGlobalState);
}
