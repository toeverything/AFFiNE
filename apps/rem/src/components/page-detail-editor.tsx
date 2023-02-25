import dynamic from 'next/dynamic';
import React from 'react';

import { BlockSuiteWorkspace } from '../shared';
import { PageNotFoundError } from './blocksuite/block-suite-error-eoundary';
import { BlockSuiteEditorHeader } from './blocksuite/header';

export type PageDetailEditorProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
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
}) => {
  const page = blockSuiteWorkspace.getPage(pageId);
  if (!page) {
    throw new PageNotFoundError(blockSuiteWorkspace, pageId);
  }
  return (
    <>
      <BlockSuiteEditorHeader
        blockSuiteWorkspace={blockSuiteWorkspace}
        pageId={pageId}
      />
      <Editor page={page} />
    </>
  );
};
