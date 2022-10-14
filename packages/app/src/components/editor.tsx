import { Suspense, useEffect, useRef } from 'react';
import type { EditorContainer } from '@blocksuite/editor';
import { Text } from '@blocksuite/store';
import '@blocksuite/blocks';
import '@blocksuite/editor';
import '@blocksuite/blocks/style';
import { useEditor } from '@/components/editor-provider';

export const Editor = () => {
  const editorRef = useRef<EditorContainer>();
  const { setEditor } = useEditor();
  useEffect(() => {
    setEditor(editorRef.current!);
    const { store } = editorRef.current as EditorContainer;

    const pageId = store.addBlock({
      flavour: 'page',
      title: 'Blocksuite live demo',
    });
    const groupId = store.addBlock({ flavour: 'group' }, pageId);

    const text = new Text('Legend from here ...');
    store.addBlock({ flavour: 'paragraph', text }, groupId);

    // store._history.clear();
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
