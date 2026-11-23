import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import type { ReactElement } from 'react';

export interface SettingState {
  activeTab: SettingTab;
  scrollAnchor?: string;
}

export interface SettingSidebarItem {
  key: SettingTab;
  title: string;
  icon: ReactElement;
  testId: string;
  beta?: boolean;
}
