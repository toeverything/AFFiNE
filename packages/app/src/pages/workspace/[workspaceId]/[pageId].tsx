import { useRef, useEffect, ReactElement } from 'react';
import { styled } from '@/styles';
import { EditorHeader } from '@/components/header';
import EdgelessToolbar from '@/components/edgeless-toolbar';
import MobileModal from '@/components/mobile-modal';
import {
  useLoadWorkspace,
  useLoadPage,
} from '@/providers/app-state-provider/hooks';
import { useAppState } from '@/providers/app-state-provider/context';
import exampleMarkdown from '@/static/example-markdown';
import type { NextPageWithLayout } from '../..//_app';
import WorkspaceLayout from '@/components/workspace-layout';

const StyledEditorContainer = styled('div')(({ theme }) => {
  return {
    height: 'calc(100vh - 60px)',
  };
});

const Page: NextPageWithLayout = () => {
  const editorContainer = useRef<HTMLDivElement>(null);
  const workspace = useLoadWorkspace();
  const page = useLoadPage();
  const { createEditor, setEditor } = useAppState();

  useEffect(() => {
    const ret = () => {
      const node = editorContainer.current;
      while (node?.firstChild) {
        node.removeChild(node.firstChild);
      }
    };

    if (!workspace || !page) {
      return ret;
    }

    const editor = createEditor?.current?.(page);
    if (editor) {
      editorContainer.current?.appendChild(editor);
      setEditor?.current?.(editor);
      if (page.isEmpty) {
        const title = 'Welcome to the AFFiNE Alpha';
        const pageId = page.addBlock({
          flavour: 'affine:page',
          title,
        });
        const groupId = page.addBlock({ flavour: 'affine:group' }, pageId);
        editor.clipboard.importMarkdown(exampleMarkdown, `${groupId}`);
        workspace.setPageMeta(page.id, { title });
        page.resetHistory();
      }
    }

    return ret;
  }, [workspace, page, createEditor, setEditor]);

  return (
    <>
      <EditorHeader />
      <MobileModal />
      <StyledEditorContainer ref={editorContainer} />
      <EdgelessToolbar />
    </>
  );
};

Page.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default Page;
