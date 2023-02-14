import type React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { createStore, useStore } from 'zustand';
import { combine, subscribeWithSelector } from 'zustand/middleware';
import type { UseBoundStore } from 'zustand/react';
import type { Page } from '@blocksuite/store';
import type { BlockHub } from '@blocksuite/blocks';
import type { Workspace } from '@blocksuite/store';
import type { EditorContainer } from '@blocksuite/editor';

export type BlockSuiteState = {
  currentWorkspace: Workspace | null;
  editor: EditorContainer | null;
  currentPage: Page | null;
  blockHub: BlockHub | null;
};

export type BlockSuiteActions = {
  loadPage: (pageId: string) => void;
  setEditor: (editor: EditorContainer) => void;
  setWorkspace: (workspace: Workspace) => void;
  setBlockHub: (blockHub: BlockHub) => void;
};

const create = () =>
  createStore(
    subscribeWithSelector(
      combine<BlockSuiteState, BlockSuiteActions>(
        {
          currentWorkspace: null,
          currentPage: null,
          blockHub: null,
          editor: null,
        },
        (set, get) => ({
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
        })
      )
    )
  );
type Store = ReturnType<typeof create>;

const BlockSuiteContext = createContext<Store | null>(null);

export const useBlockSuiteApi = () => {
  const api = useContext(BlockSuiteContext);
  if (!api) {
    throw new Error('cannot find modal context');
  }
  return api;
};

export const useBlockSuite: UseBoundStore<Store> = ((
  selector: Parameters<UseBoundStore<Store>>[0],
  equals: Parameters<UseBoundStore<Store>>[1]
) => {
  const api = useBlockSuiteApi();
  return useStore(api, selector, equals);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

export const BlockSuiteProvider: React.FC<React.PropsWithChildren> =
  function ModelProvider({ children }) {
    return (
      <BlockSuiteContext.Provider value={useMemo(() => create(), [])}>
        {children}
      </BlockSuiteContext.Provider>
    );
  };
