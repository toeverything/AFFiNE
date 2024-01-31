export * from './app-config-storage';
export * from './atom';
export * from './blocksuite';
export * from './command';
export * from './di';
export * from './livedata';
export * from './page';
export * from './storage';
export * from './utils';
export * from './workspace';

import type { ServiceCollection } from './di';
import { CleanupService } from './lifecycle';
import { configurePageServices } from './page';
import { GlobalCache, GlobalState, MemoryMemento } from './storage';
import {
  configureTestingWorkspaceServices,
  configureWorkspaceServices,
} from './workspace';

export function configureInfraServices(services: ServiceCollection) {
  services.add(CleanupService);
  configureWorkspaceServices(services);
  configurePageServices(services);
}

export function configureTestingInfraServices(services: ServiceCollection) {
  configureTestingWorkspaceServices(services);
  services.override(GlobalCache, MemoryMemento);
  services.override(GlobalState, MemoryMemento);
}
