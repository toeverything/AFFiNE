import { useRef, useEffect } from 'react';
import type { NextPage } from 'next';
import { styled } from '@/styles';
import { EditorHeader } from '@/components/header';
import EdgelessToolbar from '@/components/edgeless-toolbar';
import MobileModal from '@/components/mobile-modal';
import {
  useLoadWorkspace,
  useLoadPage,
} from '@/providers/app-state-provider/hooks';
import { useAppState } from '@/providers/app-state-provider/context';
import exampleMarkdown from '@/providers/editor-provider/example-markdown';

const StyledEditorContainer = styled('div')(({ theme }) => {
  return {
    height: 'calc(100vh - 60px)',
  };
});

const Home: NextPage = () => {
  const editorContainer = useRef<HTMLDivElement>(null);
  const workspace = useLoadWorkspace();
  const page = useLoadPage();
  const { createEditor } = useAppState();

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

    const editor = createEditor(page);
    if (editor) {
      editorContainer.current?.appendChild(editor);
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
  }, [workspace, page]);

  return (
    <>
      <EditorHeader />
      <MobileModal />
      <StyledEditorContainer ref={editorContainer} />
      <EdgelessToolbar />
    </>
  );
};

export default Home;
