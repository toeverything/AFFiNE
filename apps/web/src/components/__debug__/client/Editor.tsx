'use client';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertEquals, assertExists, Generator } from '@blocksuite/store';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createEmptyBlockSuiteWorkspace } from '../../../utils';
import { BlockSuiteEditor } from '../../blocksuite/block-suite-editor';

const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
  'test',
  _ => undefined,
  Generator.AutoIncrement
);

blockSuiteWorkspace.createPage('page0');

const Editor: React.FC<{
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  testType: 'empty' | 'importMarkdown';
}> = ({ onInit, testType }) => {
  const page = blockSuiteWorkspace.getPage('page0');
  const [, rerender] = useState(false);
  const onceRef = useRef(false);
  if (!onceRef.current) {
    if (testType === 'importMarkdown') {
      if (page) {
        page.workspace.meta.setPageMeta(page.id, {
          init: true,
        });
      } else {
        blockSuiteWorkspace.slots.pageAdded.on(id => {
          const page = blockSuiteWorkspace.getPage(id);
          assertExists(page);
          assertEquals(id, 'page0');
          page.workspace.meta.setPageMeta(page.id, {
            init: true,
          });
        });
      }
    }
  }

  useEffect(() => {
    const cb = () => rerender(v => !v);
    const dispose = blockSuiteWorkspace.slots.pageAdded.on(cb);
    return () => {
      dispose.dispose();
    };
  }, []);
  const onLoad = useCallback((page: Page, editor: EditorContainer) => {
    // @ts-ignore
    globalThis.page = page;
    // @ts-ignore
    globalThis.editor = editor;
  }, []);

  if (!page) {
    return <>loading...</>;
  }
  return (
    <BlockSuiteEditor
      blockSuiteWorkspace={blockSuiteWorkspace}
      page={page}
      mode="page"
      onInit={onInit}
      onLoad={onLoad}
    />
  );
};

export default Editor;
