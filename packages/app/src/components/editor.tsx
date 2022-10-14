import { Suspense, useEffect, useRef } from 'react';
import type { EditorContainer } from '@blocksuite/editor';
import { Text } from '@blocksuite/store';
import '@blocksuite/blocks';
import '@blocksuite/editor';
import '@blocksuite/blocks/style';
import { useEditor } from '@/components/editor-provider';
import pkg from '../../package.json';

export const Editor = () => {
  const editorRef = useRef<EditorContainer>();
  const { setEditor } = useEditor();
  useEffect(() => {
    setEditor(editorRef.current!);
    const { store } = editorRef.current as EditorContainer;

    const version = pkg.dependencies['@blocksuite/editor'].substring(1);
    const pageId = store.addBlock({
      flavour: 'page',
      title: `BlockSuite live demo ${version}`,
    });
    const groupId = store.addBlock({ flavour: 'group' }, pageId);

    const text = new Text('Legend from here...');
    store.addBlock({ flavour: 'paragraph', text }, groupId);

    // store.resetHistory();
  }, [setEditor]);

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
