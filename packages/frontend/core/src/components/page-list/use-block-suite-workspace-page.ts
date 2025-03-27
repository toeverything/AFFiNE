import { DebugLogger } from '@affine/debug';
import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import type { Store, Workspace } from '@blocksuite/affine/store';
import { useEffect, useState } from 'react';

const logger = new DebugLogger('useBlockSuiteWorkspacePage');

export function useDocCollectionPage(
  docCollection: Workspace,
  pageId: string | null
): Store | null {
  const [page, setPage] = useState<Store | null>(
    pageId ? (docCollection.getDoc(pageId)?.getStore() ?? null) : null
  );

  useEffect(() => {
    const group = new DisposableGroup();
    group.add(
      docCollection.slots.docCreated.subscribe(id => {
        if (pageId === id) {
          setPage(docCollection.getDoc(id)?.getStore() ?? null);
        }
      })
    );
    group.add(
      docCollection.slots.docRemoved.subscribe(id => {
        if (pageId === id) {
          setPage(null);
        }
      })
    );
    return () => {
      group.dispose();
    };
  }, [docCollection, pageId]);

  useEffect(() => {
    if (page && !page.loaded) {
      try {
        page.load();
      } catch (err) {
        logger.error('Failed to load page', err);
      }
    }
  }, [page]);

  useEffect(() => {
    if (page?.id !== pageId) {
      setPage(
        pageId ? (docCollection.getDoc(pageId)?.getStore() ?? null) : null
      );
    }
  }, [docCollection, page?.id, pageId]);

  return page;
}
