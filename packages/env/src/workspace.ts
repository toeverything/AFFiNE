import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import type {
  ActiveDocProvider,
  PassiveDocProvider,
  Workspace as BlockSuiteWorkspace,
} from '@blocksuite/store';
import type { FC, PropsWithChildren } from 'react';

import type { Collection } from './filter.js';

export enum WorkspaceVersion {
  SubDoc = 2,
  DatabaseV3 = 3,
}

export enum WorkspaceSubPath {
  ALL = 'all',
  SETTING = 'setting',
  TRASH = 'trash',
  SHARED = 'shared',
}

export interface AffineDownloadProvider extends PassiveDocProvider {
  flavour: 'affine-download';
}

/**
 * Download the first binary from local indexeddb
 */
export interface BroadCastChannelProvider extends PassiveDocProvider {
  flavour: 'broadcast-channel';
}

/**
 * Long polling provider with local indexeddb
 */
export interface LocalIndexedDBBackgroundProvider extends PassiveDocProvider {
  flavour: 'local-indexeddb-background';
}

export interface LocalIndexedDBDownloadProvider extends ActiveDocProvider {
  flavour: 'local-indexeddb';
}

export interface SQLiteProvider extends PassiveDocProvider {
  flavour: 'sqlite';
}

export interface SQLiteDBDownloadProvider extends ActiveDocProvider {
  flavour: 'sqlite-download';
}

type BaseWorkspace = {
  flavour: string;
  id: string;
  blockSuiteWorkspace: BlockSuiteWorkspace;
};

export interface AffineCloudWorkspace extends BaseWorkspace {
  flavour: WorkspaceFlavour.AFFINE_CLOUD;
  id: string;
  blockSuiteWorkspace: BlockSuiteWorkspace;
}

export interface LocalWorkspace extends BaseWorkspace {
  flavour: WorkspaceFlavour.LOCAL;
  id: string;
  blockSuiteWorkspace: BlockSuiteWorkspace;
}

export interface AffinePublicWorkspace extends BaseWorkspace {
  flavour: WorkspaceFlavour.PUBLIC;
  id: string;
  blockSuiteWorkspace: BlockSuiteWorkspace;
}

export enum ReleaseType {
  // if workspace is not released yet, we will not show it in the workspace list
  UNRELEASED = 'unreleased',
  STABLE = 'stable',
}

export enum LoadPriority {
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
}

export enum WorkspaceFlavour {
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
  [WorkspaceFlavour.LOCAL]: LocalWorkspace;
  [WorkspaceFlavour.PUBLIC]: AffinePublicWorkspace;
  [WorkspaceFlavour.AFFINE_CLOUD]: AffineCloudWorkspace;
}

export interface WorkspaceCRUD<Flavour extends keyof WorkspaceRegistry> {
  create: (blockSuiteWorkspace: BlockSuiteWorkspace) => Promise<string>;
  delete: (blockSuiteWorkspace: BlockSuiteWorkspace) => Promise<void>;
  get: (workspaceId: string) => Promise<WorkspaceRegistry[Flavour] | null>;
  // not supported yet
  // update: (workspace: FlavourToWorkspace[Flavour]) => Promise<void>;
  list: () => Promise<WorkspaceRegistry[Flavour][]>;
}

type UIBaseProps<_Flavour extends keyof WorkspaceRegistry> = {
  currentWorkspaceId: string;
};

export type WorkspaceHeaderProps<Flavour extends keyof WorkspaceRegistry> =
  UIBaseProps<Flavour> & {
    currentEntry:
      | {
          subPath: WorkspaceSubPath;
        }
      | {
          pageId: string;
        };
  };

type NewSettingProps<Flavour extends keyof WorkspaceRegistry> =
  UIBaseProps<Flavour> & {
    onDeleteWorkspace: (id: string) => Promise<void>;
    onTransformWorkspace: <
      From extends keyof WorkspaceRegistry,
      To extends keyof WorkspaceRegistry,
    >(
      from: From,
      to: To,
      workspace: WorkspaceRegistry[From]
    ) => void;
  };

type PageDetailProps<Flavour extends keyof WorkspaceRegistry> =
  UIBaseProps<Flavour> & {
    currentPageId: string;
    onLoadEditor: (page: Page, editor: EditorContainer) => () => void;
  };

type PageListProps<_Flavour extends keyof WorkspaceRegistry> = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onOpenPage: (pageId: string, newTab?: boolean) => void;
  collection: Collection;
};

export interface WorkspaceUISchema<Flavour extends keyof WorkspaceRegistry> {
  Header: FC<WorkspaceHeaderProps<Flavour>>;
  PageDetail: FC<PageDetailProps<Flavour>>;
  PageList: FC<PageListProps<Flavour>>;
  NewSettingsDetail: FC<NewSettingProps<Flavour>>;
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

export interface WorkspaceAdapter<Flavour extends WorkspaceFlavour> {
  releaseType: ReleaseType;
  flavour: Flavour;
  // The Adapter will be loaded according to the priority
  loadPriority: LoadPriority;
  Events: Partial<AppEvents>;
  // Fetch necessary data for the first render
  CRUD: WorkspaceCRUD<Flavour>;
  UI: WorkspaceUISchema<Flavour>;
}
