import { EditorContainer } from '@blocksuite/editor';
import exampleMarkdown from '@/providers/editor-provider/example-markdown';

export const initDefaultContent = (editor: EditorContainer) => {
  const { page } = editor;
  const pageId = page.addBlock({
    flavour: 'affine:page',
    title: 'Welcome to the AFFiNE Alpha',
  });
  const groupId = page.addBlock({ flavour: 'affine:group' }, pageId);
  editor.clipboard.importMarkdown(exampleMarkdown, `${groupId}`);
  page.resetHistory();
};
