import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { AuthProps } from '../components/affine/auth';
import type { CreateWorkspaceMode } from '../components/affine/create-workspace-modal';
import type { SettingProps } from '../components/affine/setting-modal';
// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom<CreateWorkspaceMode>(false);
export const openQuickSearchModalAtom = atom(false);
export const openSignOutModalAtom = atom(false);
export const openPaymentDisableAtom = atom(false);
export const openQuotaModalAtom = atom(false);
export const openStarAFFiNEModalAtom = atom(false);
export const openIssueFeedbackModalAtom = atom(false);
export const openHistoryTipsModalAtom = atom(false);

export const rightSidebarWidthAtom = atom(320);

export type SettingAtom = Pick<
  SettingProps,
  'activeTab' | 'workspaceMetadata'
> & {
  open: boolean;
  scrollAnchor?: string;
};

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

export const openDisableCloudAlertModalAtom = atom(false);

export const recentPageIdsBaseAtom = atomWithStorage<string[]>(
  'recentPageSettings',
  []
);

export type AllPageFilterOption = 'docs' | 'collections' | 'tags';
export const allPageFilterSelectAtom = atom<AllPageFilterOption>('docs');

export const openWorkspaceListModalAtom = atom(false);
