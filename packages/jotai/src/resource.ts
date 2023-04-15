import { getEnvironment } from '@affine/env';
import type { EditorContainer } from '@blocksuite/editor';
import { atom, useAtomValue } from 'jotai';
import type { NextRouter } from 'next/router';

export const lottieAtom = atom(import('lottie-web').then(m => m.default));

export const editorContainerModuleAtom = atom<Promise<typeof EditorContainer>>(
  getEnvironment().isServer
    ? async () =>
        import('@blocksuite/editor').then(module => module.EditorContainer)
    : (import('@blocksuite/editor').then(
        module => module.EditorContainer
      ) as any)
);

const unreachable = (...args: any[]): any => {
  throw new Error(`unreachable. cannot find router context. ${args}`);
};

const inaccessible = new Proxy(
  {},
  {
    get: unreachable,
    set: unreachable,
    apply: unreachable,
  }
);

export const globalContextAtom = atom({
  router: inaccessible as NextRouter,
});

export const globalRouterAtom = atom(get => get(globalContextAtom).router);
export function useRouter() {
  return useAtomValue(globalRouterAtom);
}
