// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path='../../../apps/electron/layers/preload/preload.d.ts' />
import type { Workspace as RemoteWorkspace } from '@affine/workspace/affine/api';
import type { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import type { createStore } from 'jotai';
import type { FC, PropsWithChildren } from 'react';

export type JotaiStore = ReturnType<typeof createStore>;

export type BaseProvider = {
  flavour: string;

  // cleanup data when workspace is removed
  cleanup: () => void;
};

/**
 * @description
 * If a provider is marked as a background provider,
 *  we will connect it in the `useEffect` in React.js.
 *
 * This means that the data might be stale when you use it.
 */
export interface BackgroundProvider extends BaseProvider {
  // if this is true,
  //  we will connect the provider on the background
  background: true;
  get connected(): boolean;
  connect(): void;
  disconnect(): void;
  callbacks: Set<() => void>;
}

/**
 * @description
 * If a provider is marked as a necessary provider,
 *  we will connect it once you read the workspace.
 *
 * This means that the data will be fresh when you use it.
 *
 * Currently, there is only on necessary provider: `local-indexeddb`.
 */
export interface NecessaryProvider extends Omit<BaseProvider, 'disconnect'> {
  // if this is true,
  //  we will ensure that the provider is connected before you can use it
  necessary: true;
  sync(): void;
  get whenReady(): Promise<void>;
}

export interface AffineDownloadProvider extends BackgroundProvider {
  flavour: 'affine-download';
}

/**
 * Download the first binary from local indexeddb
 */
export interface BroadCastChannelProvider extends BackgroundProvider {
  flavour: 'broadcast-channel';
}

/**
 * Long polling provider with local indexeddb
 */
export interface LocalIndexedDBBackgroundProvider extends BackgroundProvider {
  flavour: 'local-indexeddb-background';
}

export interface SQLiteProvider extends BackgroundProvider {
  flavour: 'sqlite';
}

export interface LocalIndexedDBDownloadProvider extends NecessaryProvider {
  flavour: 'local-indexeddb';
}

export interface AffineWebSocketProvider extends BackgroundProvider {
  flavour: 'affine-websocket';
}

export type Provider = BackgroundProvider | NecessaryProvider;

export interface AffineLegacyCloudWorkspace extends RemoteWorkspace {
  flavour: WorkspaceFlavour.AFFINE;
  // empty
  blockSuiteWorkspace: BlockSuiteWorkspace;
  providers: Provider[];
}

// todo: update type with nest.js
export type AffineCloudWorkspace = LocalWorkspace;

export interface LocalWorkspace {
  flavour: WorkspaceFlavour.LOCAL;
  id: string;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  providers: Provider[];
}

export interface AffinePublicWorkspace {
  flavour: WorkspaceFlavour.PUBLIC;
  id: string;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  providers: Provider[];
}

export const enum ReleaseType {
  // if workspace is not released yet, we will not show it in the workspace list
  UNRELEASED = 'unreleased',
  STABLE = 'stable',
}

export const enum LoadPriority {
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
}

export const enum WorkspaceFlavour {
  /**
   * AFFiNE Workspace is the workspace
   * that hosted on the Legacy AFFiNE Cloud Server.
   *
   * @deprecated
   *  We no longer maintain this kind of workspace, please use AFFiNE-Cloud instead.
   */
  AFFINE = 'affine',
  /**
   * New AFFiNE Cloud Workspace using Nest.js Server.
   */
  AFFINE_CLOUD = 'affine-cloud',
  LOCAL = 'local',
  PUBLIC = 'affine-public',
}

export const settingPanel = {
  General: 'general',
  Collaboration: 'collaboration',
  Publish: 'publish',
  Export: 'export',
  Sync: 'sync',
} as const;
export const settingPanelValues = [...Object.values(settingPanel)] as const;
export type SettingPanel = (typeof settingPanel)[keyof typeof settingPanel];

// built-in workspaces
export interface WorkspaceRegistry {
  [WorkspaceFlavour.AFFINE]: AffineLegacyCloudWorkspace;
  [WorkspaceFlavour.LOCAL]: LocalWorkspace;
  [WorkspaceFlavour.PUBLIC]: AffinePublicWorkspace;
  // todo: update workspace type to new
  [WorkspaceFlavour.AFFINE_CLOUD]: AffineCloudWorkspace;
}

export interface WorkspaceCRUD<Flavour extends keyof WorkspaceRegistry> {
  create: (blockSuiteWorkspace: BlockSuiteWorkspace) => Promise<string>;
  delete: (workspace: WorkspaceRegistry[Flavour]) => Promise<void>;
  get: (workspaceId: string) => Promise<WorkspaceRegistry[Flavour] | null>;
  // not supported yet
  // update: (workspace: FlavourToWorkspace[Flavour]) => Promise<void>;
  list: () => Promise<WorkspaceRegistry[Flavour][]>;
}

type UIBaseProps<Flavour extends keyof WorkspaceRegistry> = {
  currentWorkspace: WorkspaceRegistry[Flavour];
};

type SettingProps<Flavour extends keyof WorkspaceRegistry> =
  UIBaseProps<Flavour> & {
    currentTab: SettingPanel;
    onChangeTab: (tab: SettingPanel) => void;
    onDeleteWorkspace: () => Promise<void>;
    onTransformWorkspace: <
      From extends keyof WorkspaceRegistry,
      To extends keyof WorkspaceRegistry
    >(
      from: From,
      to: To,
      workspace: WorkspaceRegistry[From]
    ) => void;
  };

type PageDetailProps<Flavour extends keyof WorkspaceRegistry> =
  UIBaseProps<Flavour> & {
    currentPageId: string;
  };

type PageListProps<_Flavour extends keyof WorkspaceRegistry> = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onOpenPage: (pageId: string, newTab?: boolean) => void;
};

export interface WorkspaceUISchema<Flavour extends keyof WorkspaceRegistry> {
  PageDetail: FC<PageDetailProps<Flavour>>;
  PageList: FC<PageListProps<Flavour>>;
  SettingsDetail: FC<SettingProps<Flavour>>;
  Provider: FC<PropsWithChildren>;
}

export interface AppEvents {
  // event there is no workspace
  // usually used to initialize workspace plugin
  'app:init': () => string[];
  // request to gain access to workspace plugin
  'workspace:access': () => Promise<void>;
  // request to revoke access to workspace plugin
  'workspace:revoke': () => Promise<void>;
}
