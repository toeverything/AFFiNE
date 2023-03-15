import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useSetAtom } from 'jotai';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import type React from 'react';
import { useCallback } from 'react';

import { currentEditorAtom } from '../atoms';
import { useBlockSuiteWorkspacePageTitle } from '../hooks/use-blocksuite-workspace-page-title';
import { usePageMeta } from '../hooks/use-page-meta';
import type { BlockSuiteWorkspace } from '../shared';
import { PageNotFoundError } from './affine/affine-error-eoundary';
import { BlockSuiteEditorHeader } from './blocksuite/header';

export type PageDetailEditorProps = {
  isPublic?: boolean;
  isPreview?: boolean;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => void;
  header?: React.ReactNode;
};

const Editor = dynamic(
  async () =>
    (await import('./blocksuite/block-suite-editor')).BlockSuiteEditor,
  {
    ssr: false,
  }
);

export const PageDetailEditor: React.FC<PageDetailEditorProps> = ({
  blockSuiteWorkspace,
  pageId,
  onInit,
  onLoad,
  header,
  isPublic,
  isPreview,
}) => {
  const page = blockSuiteWorkspace.getPage(pageId);
  if (!page) {
    throw new PageNotFoundError(blockSuiteWorkspace, pageId);
  }
  const title = useBlockSuiteWorkspacePageTitle(blockSuiteWorkspace, pageId);
  const meta = usePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const setEditor = useSetAtom(currentEditorAtom);
  assertExists(meta);
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <BlockSuiteEditorHeader
        isPublic={isPublic}
        isPreview={isPreview}
        blockSuiteWorkspace={blockSuiteWorkspace}
        pageId={pageId}
      >
        {header}
      </BlockSuiteEditorHeader>
      <Editor
        style={{
          height: 'calc(100% - 60px)',
        }}
        key={pageId}
        blockSuiteWorkspace={blockSuiteWorkspace}
        // fixme: remove mode from meta
        mode={isPublic ? 'page' : meta.mode ?? 'page'}
        page={page}
        onInit={useCallback(
          (page: Page, editor: Readonly<EditorContainer>) => {
            setEditor(editor);
            onInit(page, editor);
          },
          [onInit, setEditor]
        )}
        onLoad={onLoad}
      />
    </>
  );
};
