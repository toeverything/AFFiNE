import type { LazyDocProvider } from '@affine/env/workspace';
import { assertExists, DisposableGroup } from '@blocksuite/global/utils';
import type { Page, Workspace } from '@blocksuite/store';
import { use } from 'foxact/use';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';
import { useLayoutEffect } from 'react';

const weakMap = new WeakMap<Workspace, Map<string, Atom<Page | null>>>();

const emptyAtom = atom<Page | null>(null);

function getAtom(w: Workspace, pageId: string | null): Atom<Page | null> {
  if (!pageId) {
    return emptyAtom;
  }
  if (!weakMap.has(w)) {
    weakMap.set(w, new Map());
  }
  const map = weakMap.get(w);
  assertExists(map);
  if (!map.has(pageId)) {
    const baseAtom = atom(w.getPage(pageId));
    baseAtom.onMount = set => {
      const group = new DisposableGroup();
      group.add(
        w.slots.pageAdded.on(id => {
          if (pageId === id) {
            set(w.getPage(id));
          }
        })
      );
      group.add(
        w.slots.pageRemoved.on(id => {
          if (pageId === id) {
            set(null);
          }
        })
      );
      return () => {
        group.dispose();
      };
    };
    map.set(pageId, baseAtom);
    return baseAtom;
  } else {
    return map.get(pageId) as Atom<Page | null>;
  }
}

const resolvedPromise = Promise.resolve();

export function useBlockSuiteWorkspacePage(
  blockSuiteWorkspace: Workspace,
  pageId: string | null
): Page | null {
  const pageAtom = getAtom(blockSuiteWorkspace, pageId);
  assertExists(pageAtom);
  const page = useAtomValue(pageAtom);

  useLayoutEffect(() => {
    if (!pageId) {
      return;
    }
    const guid = `space:${pageId}`;
    // @ts-expect-error fix type later
    const lazyProviders: LazyDocProvider[] =
      blockSuiteWorkspace.providers.filter(
        // @ts-expect-error fix type later
        (provider): provider is LazyDocProvider => {
          // @ts-expect-error fix type later
          return provider.lazy;
        }
      );

    lazyProviders.forEach(provider => {
      provider.connect(guid);
    });

    return () => {
      lazyProviders.forEach(provider => {
        provider.disconnect(guid);
      });
    };
  }, [blockSuiteWorkspace.providers, pageId]);

  use(!page?.loaded ? page?.waitForLoaded() : resolvedPromise);

  return page;
}
