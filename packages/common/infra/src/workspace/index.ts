export * from './context';
export * from './engine';
export * from './factory';
export * from './global-schema';
export * from './list';
export * from './manager';
export * from './metadata';
export * from './service-scope';
export * from './storage';
export * from './testing';
export * from './upgrade';
export * from './workspace';

import type { ServiceCollection } from '../di';
import { ServiceProvider } from '../di';
import { CleanupService } from '../lifecycle';
import { GlobalCache, GlobalState, MemoryMemento } from '../storage';
import {
  BlockSuiteWorkspaceContext,
  RootYDocContext,
  WorkspaceMetadataContext,
} from './context';
import {
  AwarenessEngine,
  AwarenessProvider,
  BlobEngine,
  DocEngine,
  DocServerImpl,
  DocStorageImpl,
  LocalBlobStorage,
  RemoteBlobStorage,
  WorkspaceEngine,
} from './engine';
import { WorkspaceFactory } from './factory';
import { WorkspaceListProvider, WorkspaceListService } from './list';
import { WorkspaceManager } from './manager';
import { WorkspaceScope } from './service-scope';
import { WorkspaceLocalState } from './storage';
import {
  TestingLocalWorkspaceFactory,
  TestingLocalWorkspaceListProvider,
} from './testing';
import { WorkspaceUpgradeController } from './upgrade';
import { Workspace } from './workspace';

export function configureWorkspaceServices(services: ServiceCollection) {
  // global scope
  services
    .add(WorkspaceManager, [
      WorkspaceListService,
      [WorkspaceFactory],
      ServiceProvider,
    ])
    .add(WorkspaceListService, [[WorkspaceListProvider], GlobalCache]);

  // workspace scope
  services
    .scope(WorkspaceScope)
    .add(CleanupService)
    .add(Workspace, [
      WorkspaceMetadataContext,
      WorkspaceEngine,
      BlockSuiteWorkspaceContext,
      WorkspaceUpgradeController,
      ServiceProvider,
    ])
    .add(WorkspaceEngine, [
      BlobEngine,
      DocEngine,
      AwarenessEngine,
      RootYDocContext,
    ])
    .add(AwarenessEngine, [[AwarenessProvider]])
    .add(BlobEngine, [LocalBlobStorage, [RemoteBlobStorage]])
    .addImpl(DocEngine, services => {
      return new DocEngine(
        services.get(DocStorageImpl),
        services.getOptional(DocServerImpl)
      );
    })
    .add(WorkspaceUpgradeController, [
      BlockSuiteWorkspaceContext,
      DocEngine,
      WorkspaceMetadataContext,
    ]);
}

export function configureTestingWorkspaceServices(services: ServiceCollection) {
  services
    .override(WorkspaceListProvider('affine-cloud'), null)
    .override(WorkspaceFactory('affine-cloud'), null)
    .override(
      WorkspaceListProvider('local'),
      TestingLocalWorkspaceListProvider,
      [GlobalState]
    )
    .override(WorkspaceFactory('local'), TestingLocalWorkspaceFactory, [
      GlobalState,
    ])
    .scope(WorkspaceScope)
    .override(WorkspaceLocalState, MemoryMemento);
}
