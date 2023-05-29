import { PageNotFoundError } from '@affine/env/constant';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { useBlockSuiteWorkspacePageTitle } from '@toeverything/hooks/use-block-suite-workspace-page-title';
import { useAtomValue, useSetAtom } from 'jotai';
import Head from 'next/head';
import type React from 'react';
import { startTransition, useCallback } from 'react';

import { currentEditorAtom, workspacePreferredModeAtom } from '../atoms';
import type { AffineOfficialWorkspace } from '../shared';
import { BlockSuiteEditor as Editor } from './blocksuite/block-suite-editor';

export type PageDetailEditorProps = {
  isPublic?: boolean;
  workspace: AffineOfficialWorkspace;
  pageId: string;
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => () => void;
};

export const PageDetailEditor: React.FC<PageDetailEditorProps> = ({
  workspace,
  pageId,
  onInit,
  onLoad,
  isPublic,
}) => {
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const page = useBlockSuiteWorkspacePage(blockSuiteWorkspace, pageId);
  if (!page) {
    throw new PageNotFoundError(blockSuiteWorkspace, pageId);
  }
  const title = useBlockSuiteWorkspacePageTitle(blockSuiteWorkspace, pageId);
  const meta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const currentMode =
    useAtomValue(workspacePreferredModeAtom)[pageId] ?? 'page';
  const setEditor = useSetAtom(currentEditorAtom);
  assertExists(meta);
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <Editor
        style={{
          height: 'calc(100% - 52px)',
        }}
        key={`${workspace.flavour}-${workspace.id}-${pageId}`}
        mode={isPublic ? 'page' : currentMode}
        page={page}
        onInit={useCallback(
          (page: Page, editor: Readonly<EditorContainer>) => {
            startTransition(() => {
              setEditor(editor);
            });
            onInit(page, editor);
          },
          [onInit, setEditor]
        )}
        onLoad={useCallback(
          (page: Page, editor: EditorContainer) => {
            startTransition(() => {
              setEditor(editor);
            });
            page.workspace.setPageMeta(page.id, {
              updatedDate: Date.now(),
            });
            localStorage.setItem('last_page_id', page.id);
            if (onLoad) {
              return onLoad(page, editor);
            }
            return () => {};
          },
          [onLoad, setEditor]
        )}
      />
    </>
  );
};
