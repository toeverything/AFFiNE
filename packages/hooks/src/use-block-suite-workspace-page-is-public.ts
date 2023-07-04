import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import type { Atom, WritableAtom } from 'jotai';
import { atom, useAtom } from 'jotai';

const weakMap = new WeakMap<
  Page,
  WritableAtom<boolean, [boolean], void> & Atom<boolean>
>();

export function useBlockSuiteWorkspacePageIsPublic(page: Page) {
  if (!weakMap.has(page)) {
    const baseAtom = atom<boolean>(page.meta.isPublic ?? false);
    const writableAtom = atom(
      get => get(baseAtom),
      (get, set, isPublic: boolean) => {
        page.workspace.setPageMeta(page.id, {
          isPublic,
        });
        set(baseAtom, isPublic);
      }
    );
    baseAtom.onMount = set => {
      const disposable = page.workspace.meta.pageMetasUpdated.on(() => {
        set(page.meta.isPublic ?? false);
      });
      return () => {
        disposable.dispose();
      };
    };
    weakMap.set(page, writableAtom);
  }
  const isPublicAtom = weakMap.get(page);
  assertExists(isPublicAtom);
  return useAtom(isPublicAtom);
}
