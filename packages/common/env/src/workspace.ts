import type { PropsWithChildren, ReactNode } from 'react';

export enum WorkspaceSubPath {
  ALL = 'all',
  Collection = 'collection',
  SETTING = 'setting',
  TRASH = 'trash',
  SHARED = 'shared',
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
}

export const settingPanel = {
  General: 'general',
  Collaboration: 'collaboration',
  Publish: 'publish',
  Export: 'export',
  Sync: 'sync',
} as const;
export const settingPanelValues = Object.values(settingPanel);
export type SettingPanel = (typeof settingPanel)[keyof typeof settingPanel];

export type WorkspaceHeaderProps = {
  rightSlot?: ReactNode;
  currentEntry:
    | {
        subPath: WorkspaceSubPath;
      }
    | {
        pageId: string;
      };
};

interface FC<P> {
  (props: P): ReactNode;
}

export interface WorkspaceUISchema {
  Provider: FC<PropsWithChildren>;
  LoginCard?: FC<object>;
}

export interface WorkspaceAdapter<Flavour extends WorkspaceFlavour> {
  releaseType: ReleaseType;
  flavour: Flavour;
  // The Adapter will be loaded according to the priority
  loadPriority: LoadPriority;
  UI: WorkspaceUISchema;
}
