import type { DocCollection, DocMeta } from '@blocksuite/affine/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';

const weakMap = new WeakMap<DocCollection, Atom<DocMeta[]>>();

// this hook is extracted from './use-block-suite-page-meta.ts' to avoid circular dependency
export function useAllBlockSuiteDocMeta(
  docCollection: DocCollection
): DocMeta[] {
  if (!weakMap.has(docCollection)) {
    const baseAtom = atom<DocMeta[]>([...docCollection.meta.docMetas]);
    weakMap.set(docCollection, baseAtom);
    baseAtom.onMount = set => {
      set([...docCollection.meta.docMetas]);
      const dispose = docCollection.meta.docMetaUpdated.on(() => {
        set([...docCollection.meta.docMetas]);
      });
      return () => {
        dispose.dispose();
      };
    };
  }
  return useAtomValue(weakMap.get(docCollection) as Atom<DocMeta[]>);
}
