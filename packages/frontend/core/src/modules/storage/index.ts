import { type Framework, GlobalCache, GlobalState } from '@toeverything/infra';

import {
  LocalStorageGlobalCache,
  LocalStorageGlobalState,
} from './impls/storage';

export function configureBrowserStorageImpls(framework: Framework) {
  framework.impl(GlobalCache, LocalStorageGlobalCache);
  framework.impl(GlobalState, LocalStorageGlobalState);
}
