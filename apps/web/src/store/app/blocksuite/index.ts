import { Page, Workspace } from '@blocksuite/store';
import { EditorContainer } from '@blocksuite/editor';
import { BlockHub } from '@blocksuite/blocks';
import { GlobalActionsCreator } from '@/store/app';

export interface BlockSuiteState {
  currentWorkspace: Workspace | null;
  editor: EditorContainer | null;
  currentPage: Page | null;
  blockHub: BlockHub | null;
}

export const createBlockSuiteState = (): BlockSuiteState => ({
  currentWorkspace: null,
  currentPage: null,
  blockHub: null,
  editor: null,
});

export interface BlockSuiteActions {
  loadPage: (pageId: string) => void;
  setEditor: (editor: EditorContainer) => void;
  setWorkspace: (workspace: Workspace) => void;
  setBlockHub: (blockHub: BlockHub) => void;
}

export const createBlockSuiteActions: GlobalActionsCreator<
  BlockSuiteActions
> = (set, get) => ({
  setWorkspace: workspace => {
    set({
      currentWorkspace: workspace,
    });
  },
  setEditor: editor => {
    set({
      editor,
    });
  },
  loadPage: pageId => {
    const { currentWorkspace } = get();
    if (currentWorkspace === null) {
      console.warn('currentWorkspace is null');
      return;
    }
    const page = currentWorkspace.getPage(pageId);
    if (page === null) {
      console.warn('cannot find page ', pageId);
      return;
    }
    set({
      currentPage: page,
    });
  },
  setBlockHub: blockHub => {
    set({
      blockHub,
    });
  },
});
