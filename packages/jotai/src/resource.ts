import { getEnvironment } from '@affine/env';
import { atom } from 'jotai';

export const lottieAtom = atom(import('lottie-web').then(m => m.default));

export const editorContainerModuleAtom = atom(
  getEnvironment().isServer
    ? () => import('@blocksuite/editor').then(module => module.EditorContainer)
    : import('@blocksuite/editor').then(module => module.EditorContainer)
);
