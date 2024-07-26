export * from './app-config-storage';
export * from './atom';
export * from './blocksuite';
export * from './framework';
export * from './initialization';
export * from './livedata';
export * from './modules/db';
export * from './modules/doc';
export * from './modules/global-context';
export * from './modules/lifecycle';
export * from './modules/storage';
export * from './modules/workspace';
export * from './storage';
export * from './sync';
export * from './utils';

import type { Framework } from './framework';
import { configureWorkspaceDBModule } from './modules/db';
import { configureDocModule } from './modules/doc';
import { configureGlobalContextModule } from './modules/global-context';
import { configureLifecycleModule } from './modules/lifecycle';
import {
  configureGlobalStorageModule,
  configureTestingGlobalStorage,
} from './modules/storage';
import {
  configureTestingWorkspaceProvider,
  configureWorkspaceModule,
} from './modules/workspace';

export function configureInfraModules(framework: Framework) {
  configureWorkspaceModule(framework);
  configureDocModule(framework);
  configureWorkspaceDBModule(framework);
  configureGlobalStorageModule(framework);
  configureGlobalContextModule(framework);
  configureLifecycleModule(framework);
}

export function configureTestingInfraModules(framework: Framework) {
  configureTestingGlobalStorage(framework);
  configureTestingWorkspaceProvider(framework);
}
