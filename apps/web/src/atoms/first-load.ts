import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const isFirstLoadAtom = atomWithStorage<boolean>('isFirstLoad', true);
export const openTipsAtom = atom<boolean>(false);
