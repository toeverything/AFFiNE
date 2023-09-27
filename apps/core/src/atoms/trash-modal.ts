import { atom } from 'jotai';

export type TrashModal = {
  open: boolean;
  pageId: string;
  pageTitle: string;
};

export const trashModalAtom = atom<TrashModal>({
  open: false,
  pageId: '',
  pageTitle: '',
});
