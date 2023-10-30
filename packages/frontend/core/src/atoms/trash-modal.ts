import { atom } from 'jotai';

export type TrashModal = {
  open: boolean;
  pageIds: string[];
  pageTitles: string[];
};

export const trashModalAtom = atom<TrashModal>({
  open: false,
  pageIds: [],
  pageTitles: [],
});
