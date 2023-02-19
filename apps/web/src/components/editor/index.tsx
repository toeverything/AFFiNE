import '@blocksuite/blocks';

import { styled } from '@affine/component';
import { EditorContainer } from '@blocksuite/editor';
import type { Page, Workspace } from '@blocksuite/store';
import { useEffect, useRef } from 'react';

const StyledEditorContainer = styled('div')(() => {
  return {
    position: 'relative',
    height: 'calc(100% - 60px)',
    padding: '0 32px',
  };
});

type Props = {
  page: Page;
  workspace: Workspace;
  setEditor: (editor: EditorContainer) => void;
  templateMarkdown?: string;
  templateTitle?: string;
};

export const Editor = ({
  page,
  workspace,
  setEditor,
  templateMarkdown,
  templateTitle = '',
}: Props) => {
  const editorContainer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ret = () => {
      const node = editorContainer.current;
      while (node?.firstChild) {
        node.removeChild(node.firstChild);
      }
    };

    const editor = new EditorContainer();
    editor.page = page;
    editor.mode = page.meta.mode as typeof editor.mode;

    editorContainer.current?.appendChild(editor);
    if (page.isEmpty) {
      // Can not use useCurrentPageMeta to get new title, cause meta title will trigger rerender, but the second time can not remove title
      const { title: metaTitle } = page.meta;
      const title = metaTitle ? metaTitle : templateTitle;
      workspace?.setPageMeta(page.id, { title });
      const pageBlockId = page.addBlockByFlavour('affine:page', { title });
      page.addBlockByFlavour('affine:surface', {}, null);
      // Add frame block inside page block
      const frameId = page.addBlockByFlavour('affine:frame', {}, pageBlockId);
      // Add paragraph block inside frame block
      // If this is a first page in workspace, init an introduction markdown
      if (templateMarkdown) {
        editor.clipboard.importMarkdown(templateMarkdown, frameId);
        workspace.setPageMeta(page.id, { title });
      } else {
        page.addBlockByFlavour('affine:paragraph', {}, frameId);
      }
      page.resetHistory();
    }

    setEditor(editor);
    return ret;
  }, [workspace, page, setEditor, templateTitle, templateMarkdown]);

  return <StyledEditorContainer ref={editorContainer} />;
};

export default Editor;
