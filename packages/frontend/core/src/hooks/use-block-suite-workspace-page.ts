import { DisposableGroup } from '@blocksuite/global/utils';
import type { Doc, DocCollection } from '@blocksuite/store';
import { useEffect, useState } from 'react';

export function useDocCollectionPage(
  docCollection: DocCollection,
  pageId: string | null
): Doc | null {
  const [page, setPage] = useState(
    pageId ? docCollection.getDoc(pageId) : null
  );

  useEffect(() => {
    const group = new DisposableGroup();
    group.add(
      docCollection.slots.docAdded.on(id => {
        if (pageId === id) {
          setPage(docCollection.getDoc(id));
        }
      })
    );
    group.add(
      docCollection.slots.docRemoved.on(id => {
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
      page.load();
    }
  }, [page]);

  return page;
}
