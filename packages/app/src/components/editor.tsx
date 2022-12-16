import React, { useEffect, useRef } from 'react';
import { useEditor, initDefaultContent } from '@/providers/editor-provider';

export const Editor = () => {
  const editorContainer = useRef<HTMLDivElement>(null);
  const { editor, onHistoryUpdated } = useEditor();
  const ref = useRef<any>();
  useEffect(() => {
    if (editor && ref.current?.page.id !== editor?.page.id) {
      ref.current?.remove();
      ref.current = editor;

      editorContainer.current?.appendChild(editor);

      // initDefaultContent(editor);
    }
  }, [editor]);

  return (
    <div id="editor" style={{ height: '100%' }} ref={editorContainer}></div>
  );
};

export default Editor;
