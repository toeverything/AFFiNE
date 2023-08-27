import { atom } from 'jotai';

export const blocksuiteRootAtom = atom(() =>
  document.querySelector('block-suite-root')
);
