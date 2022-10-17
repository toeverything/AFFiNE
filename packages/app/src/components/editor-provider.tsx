import type { EditorContainer } from '@blocksuite/editor';

import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

type EditorContextValue = {
  editor: EditorContainer | null;
  mode: EditorContainer['mode'];
  setEditor: (editor: EditorContainer) => void;
  setMode: (mode: EditorContainer['mode']) => void;
};
type EditorContextProps = PropsWithChildren<{}>;

export const EditorContext = createContext<EditorContextValue>({
  editor: null,
  mode: 'page',
  setEditor: () => {},
  setMode: () => {},
});

export const useEditor = () => useContext(EditorContext);

export const EditorProvider = ({
  children,
}: PropsWithChildren<EditorContextProps>) => {
  const [editor, setEditor] = useState<EditorContainer | null>(null);
  const [mode, setMode] = useState<EditorContainer['mode']>('page');

  useEffect(() => {
    const event = new CustomEvent('affine.switch-mode', { detail: mode });
    window.dispatchEvent(event);
  }, [mode]);

  return (
    <EditorContext.Provider value={{ editor, setEditor, mode, setMode }}>
      {children}
    </EditorContext.Provider>
  );
};

export default EditorProvider;
