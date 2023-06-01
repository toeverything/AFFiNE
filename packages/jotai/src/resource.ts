import { env } from '@affine/env';
import type { EditorContainer } from '@blocksuite/editor';
import { atom } from 'jotai';

export const lottieAtom = atom(import('lottie-web').then(m => m.default));

export const editorContainerModuleAtom = atom<Promise<typeof EditorContainer>>(
  env.isServer
    ? async () =>
        import('@blocksuite/editor').then(module => module.EditorContainer)
    : (import('@blocksuite/editor').then(
        module => module.EditorContainer
      ) as any)
);
