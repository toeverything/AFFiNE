import { useState, useEffect } from 'react';
import type { Workspace } from '@blocksuite/store';
import type { PageMeta as OriginalPageMeta } from '@blocksuite/store';
import type { EditorContainer } from '@blocksuite/editor';

export type PageMeta = {
  favorite: boolean;
  trash: boolean;
  trashDate: number | void;
  updatedDate: number | void;
  mode: EditorContainer['mode'];
} & OriginalPageMeta;

export const usePageList = (workspace: Workspace | null) => {
  const [pageList, setPageList] = useState<PageMeta[]>([]);

  useEffect(() => {
    if (!workspace) {
      return;
    }
    setPageList(workspace.meta.pageMetas as PageMeta[]);
    const dispose = workspace.meta.pagesUpdated.on(res => {
      setPageList(workspace.meta.pageMetas as PageMeta[]);
    }).dispose;
    return () => {
      dispose();
    };
  }, [workspace]);

  return pageList;
};
