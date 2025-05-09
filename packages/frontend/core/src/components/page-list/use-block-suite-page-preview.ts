import type { Store } from '@blocksuite/affine/store';
import type { Atom } from 'jotai';
import { atom } from 'jotai';

const MAX_PREVIEW_LENGTH = 150;
const MAX_SEARCH_BLOCK_COUNT = 30;

const weakMap = new WeakMap<Store, Atom<string>>();

export const getPagePreviewText = (page: Store) => {
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
    // if preview length is enough, skip the rest of the blocks
    if (preview.join(' ').trim().length >= MAX_PREVIEW_LENGTH) {
      break;
    }
    if (!block) {
      console.error('Unexpected empty block');
      break;
    }
    if (block.flavour === 'affine:surface') {
      // The surface block is a special block that contains canvas data,
      // it should not be included in the preview.
      continue;
    }
    if (block.children) {
      queue.unshift(...block.children);
    }
    if (block.role !== 'content') {
      continue;
    }
    if (block.text) {
      // Text block e.g. paragraph/heading/list/code
      const text = block.text.toString();
      if (!text.length) {
        continue;
      }
      previewLenNeeded -= text.length;
      preview.push(text);
    } else {
      // Other block e.g. image/attachment/bookmark
      const type = block.flavour.split('affine:')[1] ?? null;
      if (type) {
        previewLenNeeded -= type.length + 2;
        preview.push(`[${type}]`);
      }
    }
  }
  return preview.join(' ').trim().slice(0, MAX_PREVIEW_LENGTH);
};

const emptyAtom = atom<string>('');

export function useBlockSuitePagePreview(page: Store | null): Atom<string> {
  if (page === null) {
    return emptyAtom;
  } else if (weakMap.has(page)) {
    return weakMap.get(page) as Atom<string>;
  } else {
    const baseAtom = atom<string>('');
    baseAtom.onMount = set => {
      const disposables = [
        page.slots.ready.subscribe(() => {
          set(getPagePreviewText(page));
        }),
        page.slots.blockUpdated.subscribe(() => {
          set(getPagePreviewText(page));
        }),
      ];
      set(getPagePreviewText(page));
      return () => {
        disposables.forEach(disposable => disposable.unsubscribe());
      };
    };
    weakMap.set(page, baseAtom);
    return baseAtom;
  }
}
