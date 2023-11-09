import type { EditorContainer } from '@blocksuite/editor';
import { useEffect, useState } from 'react';

export const getEditor = () =>
  document.querySelector('editor-container') as EditorContainer;
export const useEditor = (unload?: () => void) => {
  const [editor, setEditor] = useState<EditorContainer>();

  useEffect(() => {
    if (!editor || !editor.isConnected) {
      const editorContainer = getEditor();

      setEditor(editorContainer);
    } else {
      const editorContainer = getEditor();

      if (!editorContainer) unload?.();
    }
  }, [editor, setEditor, unload]);

  return [editor];
};
