import { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { useEffect, useRef } from 'react';

export type EditorProps = {
  page: Page;
  onInit?: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => void;
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
        console.debug('Initializing page with default content');
        // Add page block and surface block at root level
        const pageBlockId = page.addBlockByFlavour('affine:page');
        page.addBlockByFlavour('affine:surface', {}, null);
        const frameId = page.addBlockByFlavour('affine:frame', {}, pageBlockId);
        page.addBlockByFlavour('affine:paragraph', {}, frameId);
        page.resetHistory();
      }
    }
    props.onLoad?.(page, editor);
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
