export * from './context';
export * from './engine';
export * from './factory';
export * from './global-schema';
export * from './list';
export * from './manager';
export * from './metadata';
export * from './service-scope';
export * from './testing';
export * from './upgrade';
export * from './workspace';

import { type ServiceCollection, ServiceProvider } from '../di';
import { CleanupService } from '../lifecycle';
import { GlobalCache, GlobalState } from '../storage';
import {
  BlockSuiteWorkspaceContext,
  RootYDocContext,
  WorkspaceMetadataContext,
} from './context';
import {
  AwarenessEngine,
  AwarenessProvider,
  BlobEngine,
  LocalBlobStorage,
  LocalSyncStorage,
  RemoteBlobStorage,
  RemoteSyncStorage,
  SyncEngine,
  WorkspaceEngine,
} from './engine';
import { WorkspaceFactory } from './factory';
import { WorkspaceListProvider, WorkspaceListService } from './list';
import { WorkspaceManager } from './manager';
import { WorkspaceScope } from './service-scope';
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
    .add(WorkspaceEngine, [BlobEngine, SyncEngine, AwarenessEngine])
    .add(AwarenessEngine, [[AwarenessProvider]])
    .add(BlobEngine, [LocalBlobStorage, [RemoteBlobStorage]])
    .add(SyncEngine, [RootYDocContext, LocalSyncStorage, [RemoteSyncStorage]])
    .add(WorkspaceUpgradeController, [
      BlockSuiteWorkspaceContext,
      SyncEngine,
      WorkspaceMetadataContext,
    ]);
}

export function configureTestingWorkspaceServices(services: ServiceCollection) {
  services
    .addImpl(WorkspaceListProvider, TestingLocalWorkspaceListProvider, [
      GlobalState,
    ])
    .addImpl(WorkspaceFactory, TestingLocalWorkspaceFactory, [GlobalState]);
}
