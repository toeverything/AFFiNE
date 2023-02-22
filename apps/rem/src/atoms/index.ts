import { atom } from 'jotai';

export const currentWorkspaceIdAtom = atom<string | null>(null);
export const currentPageIdAtom = atom<string | null>(null);

export const openWorkspacesModalAtom = atom(false);
