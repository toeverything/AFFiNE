import { EditorContainer } from '@blocksuite/editor';
import exampleMarkdown from '@/providers/editor-provider/example-markdown';

export const initDefaultContent = (editor: EditorContainer) => {
  const { space } = editor;
  const pageId = space.addBlock({
    flavour: 'affine:page',
    title: 'Welcome to the AFFiNE Alpha',
  });
  const groupId = space.addBlock({ flavour: 'affine:group' }, pageId);
  editor.clipboard.importMarkdown(exampleMarkdown, `${groupId}`);
  space.resetHistory();
};
