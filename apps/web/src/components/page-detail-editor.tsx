import type { EditorContainer } from '@blocksuite/editor';
import { assertExists, Page } from '@blocksuite/store';
import dynamic from 'next/dynamic';
import React from 'react';
import { Helmet } from 'react-helmet-async';

import { useBlockSuiteWorkspacePageTitle } from '../hooks/use-blocksuite-workspace-page-title';
import { usePageMeta } from '../hooks/use-page-meta';
import { BlockSuiteWorkspace } from '../shared';
import { PageNotFoundError } from './affine/affine-error-eoundary';
import { BlockSuiteEditorHeader } from './blocksuite/header';

export type PageDetailEditorProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
  onInit?: (page: Page, editor: Readonly<EditorContainer>) => void;
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
}) => {
  const page = blockSuiteWorkspace.getPage(pageId);
  if (!page) {
    throw new PageNotFoundError(blockSuiteWorkspace, pageId);
  }
  const title = useBlockSuiteWorkspacePageTitle(blockSuiteWorkspace, pageId);
  const meta = usePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(meta);
  return (
    <>
      <Helmet defaultTitle={title}>
        <title>{title}</title>
      </Helmet>
      <BlockSuiteEditorHeader
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
        mode={meta.mode ?? 'page'}
        page={page}
        onInit={onInit}
        onLoad={onLoad}
      />
    </>
  );
};
