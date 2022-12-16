import { EditorContainer } from '@blocksuite/editor';
import exampleMarkdown from '@/providers/editor-provider/example-markdown';
import { Page, Workspace } from '@blocksuite/store';

export const initIntroductionMeta = (workspace: Workspace, page: Page) => {
  workspace!.meta.setPage(page.id.replace('space:', ''), {
    title: 'Welcome to the AFFiNE Alpha',
  });
};
export const initIntroduction = (
  workspace: Workspace,
  editor: EditorContainer
) => {
  const { page } = editor;
  const title = 'Welcome to the AFFiNE Alpha';
  const pageId = page.addBlock({
    flavour: 'affine:page',
    title,
  });
  const groupId = page.addBlock({ flavour: 'affine:group' }, pageId);
  editor.clipboard.importMarkdown(exampleMarkdown, `${groupId}`);
  workspace.setPageMeta(page.id, { title });
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
      resolve(page as Page);
    });
  });
};

export const initEmptyPage = (page: Page) => {
  const pageBlockId = page.addBlock({ flavour: 'affine:page' });
  const groupId = page.addBlock({ flavour: 'affine:group' }, pageBlockId);
  page.addBlock({ flavour: 'affine:paragraph' }, groupId);
  return page;
};

export const initPage = (
  workspace: Workspace,
  page: Page,
  { title = '' }: { title?: string } = {}
) => {
  const pageBlockId = page.addBlock({ flavour: 'affine:page', title });
  const groupId = page.addBlock({ flavour: 'affine:group' }, pageBlockId);
  page.addBlock({ flavour: 'affine:paragraph' }, groupId);
  if (title) {
    workspace!.meta.setPage(page.id.replace('space:', ''), { title });
  }
  return page;
};

export const generateDefaultPageId = () => {
  return new Date().getTime().toString();
};

export const getEditor = () => {
  return document.querySelector('editor-container') as EditorContainer | null;
};

export const getEditorMode = () => {
  const editorContainer = document.querySelector('editor-container');
  return editorContainer?.mode;
};

export const setEditorMode = (mode: EditorContainer['mode']) => {
  const editorContainer = document.querySelector('editor-container');
  editorContainer?.setAttribute('mode', mode as string);
};
