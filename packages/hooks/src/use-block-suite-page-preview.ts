import type { ParagraphBlockModel } from '@blocksuite/blocks/models';
import type { Page } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom } from 'jotai';

const weakMap = new WeakMap<Page, Atom<string>>();

const getPagePreviewText = (page: Page) => {
  const paragraphBlocks = page.getBlockByFlavour(
    'affine:paragraph'
  ) as ParagraphBlockModel[];
  const text = paragraphBlocks.map(block => block.text.toString()).join('\n');
  return text.slice(0, 30);
};

export function useBlockSuitePagePreview(page: Page): Atom<string> {
  if (weakMap.has(page)) {
    return weakMap.get(page) as Atom<string>;
  } else {
    const baseAtom = atom<string>(getPagePreviewText(page));
    baseAtom.onMount = set => {
      const disposable = page.slots.yUpdated.on(() => {
        set(getPagePreviewText(page));
      });
      return () => {
        disposable.dispose();
      };
    };
    weakMap.set(page, baseAtom);
    return baseAtom;
  }
}
