import '@blocksuite/editor/themes/affine.css';

import { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { useEffect, useRef } from 'react';

export type EditorProps = {
  page: Page;
  onInit?: (page: Page, editor: Readonly<EditorContainer>) => void;
};

export const BlockSuiteEditor = (props: EditorProps) => {
  const page = props.page;
  const editorRef = useRef<EditorContainer | null>(null);
  if (editorRef.current === null) {
    editorRef.current = new EditorContainer();
  }
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !ref.current || !page) {
      return;
    }

    editor.page = page;
    if (page.root === null) {
      if (props.onInit) {
        props.onInit(page, editor);
      } else {
        const pageBlockId = page.addBlockByFlavour('affine:page');
        const frameId = page.addBlockByFlavour('affine:frame', {}, pageBlockId);
        page.addBlockByFlavour('affine:paragraph', {}, frameId);
        page.resetHistory();
      }
    }
    return;
  }, [page, props]);

  useEffect(() => {
    const editor = editorRef.current;
    const container = ref.current;

    if (!editor || !container || !page) {
      return;
    }

    container.appendChild(editor);
    return () => {
      container.removeChild(editor);
    };
  }, [page]);
  return <div className="editor-wrapper" ref={ref} />;
};
