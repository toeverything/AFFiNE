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
