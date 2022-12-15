import { useEffect, useState } from 'react';
import { Page, Workspace } from '@blocksuite/store';
import { EditorContainer } from '@blocksuite/editor';

export const useMode = ({
  page,
  workspace,
}: {
  page?: Page;
  workspace?: Workspace;
}) => {
  const [mode, setMode] = useState<EditorContainer['mode']>('page');

  useEffect(() => {
    if (!page || !workspace) {
      return;
    }
    const pageMeta = workspace.meta.pageMetas.find(
      p => p.id === page.pageId.replace('space:', '')
    );

    if (pageMeta?.mode) {
      // @ts-ignore
      setMode(pageMeta.mode);
    }
  }, [page, workspace]);

  useEffect(() => {
    // FIXME
    const editorContainer = document.querySelector('editor-container');
    editorContainer?.setAttribute('mode', mode as string);
    if (page && workspace) {
      workspace.setPageMeta(page.id, { mode });
    }
  }, [workspace, page, mode]);

  return {
    mode,
    setMode,
  };
};

export default useMode;
