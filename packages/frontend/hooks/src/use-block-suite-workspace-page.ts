import { DebugLogger } from '@affine/debug';
import { assertExists, DisposableGroup } from '@blocksuite/global/utils';
import type { Page, Workspace } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';
import PQueue from 'p-queue';
import { useEffect } from 'react';

const logger = new DebugLogger('use-block-suite-workspace-page');

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
// concurrently load 3 pages at most
const CONCURRENT_JOBS = 3;

const loadPageQueue = new PQueue({
  concurrency: CONCURRENT_JOBS,
});

const loadedPages = new WeakSet<Page>();

const awaitForIdle = () =>
  new Promise(resolve =>
    requestIdleCallback(resolve, {
      timeout: 1000, // do not wait for too long
    })
  );

const awaitForTimeout = (timeout: number) =>
  new Promise(resolve => setTimeout(resolve, timeout));

/**
 * Load a page and wait for it to be loaded
 * This page will be loaded in a queue so that it will not jam the network and browser CPU
 */
export function loadPage(page: Page, priority = 0) {
  if (loadedPages.has(page)) {
    return Promise.resolve();
  }
  loadedPages.add(page);
  return loadPageQueue.add(
    async () => {
      if (!page.loaded) {
        await awaitForIdle();
        await page.waitForLoaded();
        logger.debug('page loaded', page.id);
        // we do not know how long it takes to load a page here
        // so that we just use 300ms timeout as the default page processing time
        await awaitForTimeout(300);
      } else {
        // do nothing if it is already loaded
      }
    },
    {
      priority,
    }
  );
}

export function useBlockSuiteWorkspacePage(
  blockSuiteWorkspace: Workspace,
  pageId: string | null
): Page | null {
  const pageAtom = getAtom(blockSuiteWorkspace, pageId);
  assertExists(pageAtom);
  const page = useAtomValue(pageAtom);

  useEffect(() => {
    if (page && !page.loaded) {
      loadPage(page).catch(err => {
        logger.error('Failed to load page', err);
      });
    }
  }, [page]);

  return page;
}
