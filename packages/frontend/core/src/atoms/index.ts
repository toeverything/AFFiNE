import { atom } from 'jotai';

import type { AuthProps } from '../components/affine/auth';
import type { CreateWorkspaceMode } from '../components/affine/create-workspace-modal';
import type { SettingProps } from '../components/affine/setting-modal';
import type { ActiveTab } from '../components/affine/setting-modal/types';
// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom<CreateWorkspaceMode>(false);
export const openSignOutModalAtom = atom(false);
export const openQuotaModalAtom = atom(false);
export const openStarAFFiNEModalAtom = atom(false);
export const openIssueFeedbackModalAtom = atom(false);
export const openHistoryTipsModalAtom = atom(false);
export const openInfoModalAtom = atom(false);

export const rightSidebarWidthAtom = atom(320);

export type PlansScrollAnchor =
  | 'aiPricingPlan'
  | 'cloudPricingPlan'
  | 'lifetimePricingPlan';
export type SettingAtom = {
  open: boolean;
  workspaceMetadata?: SettingProps['workspaceMetadata'];
} & (
  | {
      activeTab: 'plans';
      scrollAnchor?: PlansScrollAnchor;
    }
  | { activeTab: Exclude<ActiveTab, 'plans'> }
);

export const openSettingModalAtom = atom<SettingAtom>({
  activeTab: 'appearance',
  open: false,
});

export type AuthAtom = {
  openModal: boolean;
  state: AuthProps['state'];
  email?: string;
  emailType?: AuthProps['emailType'];
};

export const authAtom = atom<AuthAtom>({
  openModal: false,
  state: 'signIn',
  email: '',
  emailType: 'changeEmail',
});

export type AllPageFilterOption = 'docs' | 'collections' | 'tags';
export const allPageFilterSelectAtom = atom<AllPageFilterOption>('docs');

export const openWorkspaceListModalAtom = atom(false);
