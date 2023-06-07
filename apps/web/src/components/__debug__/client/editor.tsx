import { initEmptyPage } from '@affine/env/blocksuite';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { Generator } from '@blocksuite/store';
import type React from 'react';
import { useCallback } from 'react';

import { BlockSuiteEditor } from '../../blocksuite/block-suite-editor';

const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
  'test',
  WorkspaceFlavour.LOCAL,
  {
    idGenerator: Generator.AutoIncrement,
  }
);

const page = blockSuiteWorkspace.createPage({ id: 'page0' });

const Editor: React.FC = () => {
  const onLoad = useCallback((page: Page, editor: EditorContainer) => {
    // @ts-ignore
    globalThis.page = page;
    // @ts-ignore
    globalThis.editor = editor;
    return () => void 0;
  }, []);

  if (!page) {
    return <>loading...</>;
  }
  return (
    <BlockSuiteEditor
      page={page}
      mode="page"
      onInit={initEmptyPage}
      onLoad={onLoad}
    />
  );
};

export default Editor;
