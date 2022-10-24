import { Suspense, useEffect, useRef } from 'react';
import type { EditorContainer } from '@blocksuite/editor';
import '@blocksuite/blocks';
import '@blocksuite/editor';
import '@blocksuite/blocks/style';
import { useEditor } from '@/components/editor-provider';
import pkg from '../../package.json';
import exampleMarkdown from './example-markdown';
export const Editor = () => {
  const editorRef = useRef<EditorContainer>();
  const { setEditor } = useEditor();
  useEffect(() => {
    setEditor(editorRef.current!);
    const { store } = editorRef.current as EditorContainer;
    const pageId = store.addBlock({
      flavour: 'page',
      title: 'Welcome to the AFFiNE Alpha',
    });
    const groupId = store.addBlock({ flavour: 'group' }, pageId);
    editorRef.current!.clipboard.importMarkdown(exampleMarkdown, `${groupId}`);
    store.resetHistory();
  }, [setEditor]);

  useEffect(() => {
    const version = pkg.dependencies['@blocksuite/editor'].substring(1);
    console.log(`BlockSuite live demo ${version}`);
  }, []);

  return (
    <Suspense fallback={<div>Error!</div>}>
      <editor-container ref={editorRef} />
    </Suspense>
  );
};

declare global {
  interface HTMLElementTagNameMap {
    'editor-container': EditorContainer;
  }

  namespace JSX {
    interface IntrinsicElements {
      // TODO fix type error
      'editor-container': any; // EditorContainer
    }
  }
}

export default Editor;
