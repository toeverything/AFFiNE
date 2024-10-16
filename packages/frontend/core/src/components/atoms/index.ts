import { atom } from 'jotai';

import type { SettingProps } from '../affine/setting-modal';
import type { ActiveTab } from '../affine/setting-modal/types';
// modal atoms
export const openWorkspacesModalAtom = atom(false);
/**
 * @deprecated use `useSignOut` hook instated
 */
export const openQuotaModalAtom = atom(false);
export const openStarAFFiNEModalAtom = atom(false);
export const openIssueFeedbackModalAtom = atom(false);
export const openHistoryTipsModalAtom = atom(false);

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

export type AuthAtomData =
  | { state: 'signIn' }
  | {
      state: 'afterSignUpSendEmail';
      email: string;
    }
  | {
      state: 'afterSignInSendEmail';
      email: string;
    }
  | {
      state: 'signInWithPassword';
      email: string;
    }
  | {
      state: 'sendEmail';
      email: string;
      emailType:
        | 'setPassword'
        | 'changePassword'
        | 'changeEmail'
        | 'verifyEmail';
    };

export const authAtom = atom<
  AuthAtomData & {
    openModal: boolean;
  }
>({
  openModal: false,
  state: 'signIn',
});

export type AllPageFilterOption = 'docs' | 'collections' | 'tags';
export const allPageFilterSelectAtom = atom<AllPageFilterOption>('docs');

export const openWorkspaceListModalAtom = atom(false);
