import { atom } from 'jotai';

export const previewBlockIdAtom = atom<string | null>(null);
export const hasAnimationPlayedAtom = atom<boolean | null>(true);

previewBlockIdAtom.onMount = set => {
  const callback = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'IMG') {
      const imageBlock = target.closest('affine-image');
      if (imageBlock) {
        const blockId = imageBlock.getAttribute('data-block-id');
        if (!blockId) return;
        set(blockId);
      }
    }
  };
  window.addEventListener('dblclick', callback);
  return () => {
    window.removeEventListener('dblclick', callback);
  };
};
