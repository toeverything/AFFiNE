import type { Page } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom } from 'jotai';

const MAX_PREVIEW_LENGTH = 150;
const MAX_SEARCH_BLOCK_COUNT = 30;

const weakMap = new WeakMap<Page, Atom<string>>();

export const getPagePreviewText = (page: Page) => {
  const pageRoot = page.root;
  if (!pageRoot) {
    return '';
  }
  const preview: string[] = [];
  // DFS
  const queue = [pageRoot];
  let previewLenNeeded = MAX_PREVIEW_LENGTH;
  let count = MAX_SEARCH_BLOCK_COUNT;
  while (queue.length && previewLenNeeded > 0 && count-- > 0) {
    const block = queue.shift();
    if (!block) {
      console.error('Unexpected empty block');
      break;
    }
    if (block.children) {
      queue.unshift(...block.children);
    }
    if (block.role !== 'content') {
      continue;
    }
    if (block.text) {
      const text = block.text.toString();
      if (!text.length) {
        continue;
      }
      previewLenNeeded -= text.length;
      preview.push(text);
    } else {
      // image/attachment/bookmark
      const type = block.flavour.split('affine:')[1] ?? null;
      previewLenNeeded -= type.length + 2;
      type && preview.push(`[${type}]`);
    }
  }
  return preview.join(' ');
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
