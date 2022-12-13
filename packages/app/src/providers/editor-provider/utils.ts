import { EditorContainer } from '@blocksuite/editor';
import exampleMarkdown from '@/providers/editor-provider/example-markdown';
import { Page, Workspace } from '@blocksuite/store';

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

export const createPage = (
  workspace: Workspace,
  pageId: string
): Promise<Page> => {
  return new Promise(resolve => {
    workspace.createPage(pageId);
    workspace.signals.pageAdded.once(addedPageId => {
      const page = workspace!.getPage(addedPageId);
      resolve(page);
    });
  });
};

export const initialPage = (page: Page) => {
  const pageBlockId = page.addBlock({ flavour: 'affine:page' });
  const groupId = page.addBlock({ flavour: 'affine:group' }, pageBlockId);
  page.addBlock({ flavour: 'affine:paragraph' }, groupId);
  return page;
};

export const generateDefaultPageId = () => {
  return new Date().getTime().toString();
};
