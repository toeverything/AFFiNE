import { useTranslation } from '@affine/i18n';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useBlockSuiteWorkspacePageTitle } from '@toeverything/hooks/use-blocksuite-workspace-page-title';
import { useAtomValue, useSetAtom } from 'jotai';
import Head from 'next/head';
import type React from 'react';
import { lazy, startTransition, Suspense, useCallback, useEffect } from 'react';

import { currentEditorAtom, workspacePreferredModeAtom } from '../atoms';
import { usePageMeta } from '../hooks/use-page-meta';
import type { AffineOfficialWorkspace } from '../shared';
import { toast } from '../utils';
import { PageNotFoundError } from './affine/affine-error-eoundary';
import { WorkspaceHeader } from './blocksuite/workspace-header';

export type PageDetailEditorProps = {
  isPublic?: boolean;
  isPreview?: boolean;
  workspace: AffineOfficialWorkspace;
  pageId: string;
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => void;
  header?: React.ReactNode;
};

const Editor = lazy(() =>
  import('./blocksuite/block-suite-editor').then(module => ({
    default: module.BlockSuiteEditor,
  }))
);

export const PageDetailEditor: React.FC<PageDetailEditorProps> = ({
  workspace,
  pageId,
  onInit,
  onLoad,
  header,
  isPublic,
  isPreview,
}) => {
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const page = blockSuiteWorkspace.getPage(pageId);
  if (!page) {
    throw new PageNotFoundError(blockSuiteWorkspace, pageId);
  }
  const title = useBlockSuiteWorkspacePageTitle(blockSuiteWorkspace, pageId);
  const meta = usePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const currentMode =
    useAtomValue(workspacePreferredModeAtom)[pageId] ?? 'page';
  const setEditor = useSetAtom(currentEditorAtom);
  assertExists(meta);

  // Prevent default "save page as" keyboard shortcut
  const { t } = useTranslation();
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.key === 's' && e.metaKey) || (e.key === 's' && e.ctrlKey)) {
        e.preventDefault();
        if (workspace.flavour === WorkspaceFlavour.LOCAL) {
          toast(t('All changes are saved locally in real time.'));
        }
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [workspace.flavour]);

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <WorkspaceHeader
        isPublic={isPublic ?? false}
        isPreview={isPreview ?? false}
        workspace={workspace}
        currentPage={page}
      >
        {header}
      </WorkspaceHeader>
      <Suspense>
        <Editor
          style={{
            height: 'calc(100% - 52px)',
          }}
          key={pageId}
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
              onLoad?.(page, editor);
            },
            [onLoad, setEditor]
          )}
        />
      </Suspense>
    </>
  );
};
