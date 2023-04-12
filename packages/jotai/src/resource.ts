import { atom } from 'jotai';

export const lottieAtom = atom(async () =>
  import('lottie-web').then(m => m.default)
);
