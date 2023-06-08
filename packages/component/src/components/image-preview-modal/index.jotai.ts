import type { EmbedBlockDoubleClickData } from '@blocksuite/blocks';
import { atom } from 'jotai';

export const previewBlockIdAtom = atom<string | null>(null);

previewBlockIdAtom.onMount = set => {
  if (typeof window !== 'undefined') {
    const callback = (event: CustomEvent<EmbedBlockDoubleClickData>) => {
      set(event.detail.blockId);
    };
    window.addEventListener('affine.embed-block-db-click', callback);
    return () => {
      window.removeEventListener('affine.embed-block-db-click', callback);
    };
  }
  return () => {};
};
