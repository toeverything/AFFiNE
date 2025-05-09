import { atom } from 'jotai';

/**
 * @deprecated use `useSignOut` hook instated
 */
export const openQuotaModalAtom = atom(false);

export type AllPageFilterOption = 'docs' | 'collections' | 'tags';
export const allPageFilterSelectAtom = atom<AllPageFilterOption>('docs');

export const openWorkspaceListModalAtom = atom(false);
