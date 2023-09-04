import { atom } from 'jotai';

export const lottieAtom = atom(import('lottie-web').then(m => m.default));
