export * from './app-config-storage';
export * from './atom';
export * from './blocksuite';
export * from './command';
export * from './di';
export * from './livedata';
export * from './storage';

import type { ServiceCollection } from './di';
import { CleanupService } from './lifecycle';
import { GlobalCache, GlobalState, MemoryMemento } from './storage';

export function configureInfraServices(services: ServiceCollection) {
  services.add(CleanupService);
}

export function configureTestingInfraServices(services: ServiceCollection) {
  configureInfraServices(services);
  services.addImpl(GlobalCache, MemoryMemento);
  services.addImpl(GlobalState, MemoryMemento);
}
