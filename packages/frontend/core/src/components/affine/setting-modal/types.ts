export const GeneralSettingKeys = [
  'shortcuts',
  'appearance',
  'about',
  'plans',
  'billing',
] as const;

export const WorkspaceSubTabs = [
  'preference',
  'experimental-features',
] as const;

export type GeneralSettingKey = (typeof GeneralSettingKeys)[number];

export type WorkspaceSubTab = (typeof WorkspaceSubTabs)[number];

export type ActiveTab =
  | GeneralSettingKey
  | 'account'
  | `workspace:${WorkspaceSubTab}`;
