import type { ParagraphBlockModel } from '@blocksuite/blocks/models';
import type { Page } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom } from 'jotai';

const weakMap = new WeakMap<Page, Atom<string>>();

export const getPagePreviewText = (page: Page) => {
  // TODO this is incorrect, since the order of blocks is not guaranteed
  const paragraphBlocks = page.getBlockByFlavour(
    'affine:paragraph'
  ) as ParagraphBlockModel[];
  const text = paragraphBlocks
    .slice(0, 10)
    .map(block => block.text.toString())
    .join('\n');
  return text.slice(0, 300);
};

const emptyAtom = atom<string>('');

export function useBlockSuitePagePreview(page: Page | null): Atom<string> {
  if (page === null) {
    return emptyAtom;
  } else if (weakMap.has(page)) {
    return weakMap.get(page) as Atom<string>;
  } else {
    const baseAtom = atom<string>('');
    baseAtom.onMount = set => {
      const disposables = [
        page.slots.ready.on(() => {
          set(getPagePreviewText(page));
        }),
        page.slots.yUpdated.on(() => {
          set(getPagePreviewText(page));
        }),
      ];
      set(getPagePreviewText(page));
      return () => {
        disposables.forEach(disposable => disposable.dispose());
      };
    };
    weakMap.set(page, baseAtom);
    return baseAtom;
  }
}
