export const GeneralSettingKeys = [
  'shortcuts',
  'appearance',
  'about',
  'plans',
  'billing',
  'experimental-features',
  'editor',
] as const;

export const WorkspaceSubTabs = ['preference', 'properties'] as const;

export type GeneralSettingKey = (typeof GeneralSettingKeys)[number];

export type WorkspaceSubTab = (typeof WorkspaceSubTabs)[number];

export type ActiveTab =
  | GeneralSettingKey
  | 'account'
  | `workspace:${WorkspaceSubTab}`;
