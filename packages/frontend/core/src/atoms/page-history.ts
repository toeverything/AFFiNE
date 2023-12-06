import { atom } from 'jotai';

// make page history controllable by atom to make it easier to use in CMDK
export const pageHistoryModalAtom = atom({
  open: false,
  pageId: '',
});
