import { useEffect, useRef } from 'react';
import type { Page, Workspace } from '@blocksuite/store';
import '@blocksuite/blocks';
import { EditorContainer } from '@blocksuite/editor';
import exampleMarkdown from '@/templates/Welcome-to-AFFiNE-Alpha-v2.0.md';
import { styled } from '@/styles';

const StyledEditorContainer = styled('div')(() => {
  return {
    height: 'calc(100vh - 60px)',
    padding: '0 32px',
  };
});

type Props = {
  page: Page;
  workspace: Workspace;
  setEditor: (editor: EditorContainer) => void;
};

export const Editor = ({ page, workspace, setEditor }: Props) => {
  const editorContainer = useRef<HTMLDivElement>(null);
  // const { currentWorkspace, currentPage, setEditor } = useAppState();
  useEffect(() => {
    const ret = () => {
      const node = editorContainer.current;
      while (node?.firstChild) {
        node.removeChild(node.firstChild);
      }
    };

    const editor = new EditorContainer();
    editor.page = page;
    editorContainer.current?.appendChild(editor);
    if (page.isEmpty) {
      const isFirstPage = workspace?.meta.pageMetas.length === 1;
      // Can not use useCurrentPageMeta to get new title, cause meta title will trigger rerender, but the second time can not remove title
      const { title: metaTitle } = page.meta;
      const title = metaTitle
        ? metaTitle
        : isFirstPage
        ? 'Welcome to AFFiNE Alpha "Abbey Wood"'
        : '';
      workspace?.setPageMeta(page.id, { title });

      const pageId = page.addBlock({
        flavour: 'affine:page',
        title,
      });
      page.addBlock({ flavour: 'affine:surface' });
      const frameId = page.addBlock({ flavour: 'affine:frame' }, pageId);
      page.addBlock({ flavour: 'affine:frame' }, pageId);
      // If this is a first page in workspace, init an introduction markdown
      if (isFirstPage) {
        editor.clipboard.importMarkdown(exampleMarkdown, `${frameId}`);
        workspace.setPageMeta(page.id, { title });
        page.resetHistory();
      }
      page.resetHistory();
    }

    setEditor(editor);
    document.title = page?.meta.title || 'Untitled';
    return ret;
  }, [workspace, page, setEditor]);

  return <StyledEditorContainer ref={editorContainer} />;
};

export default Editor;
