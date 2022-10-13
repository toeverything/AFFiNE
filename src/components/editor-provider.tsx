import type { EditorContainer } from '@blocksuite/editor';

import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

type EditorContextValue = {
  editor: EditorContainer | null;
  setEditor: (editor: EditorContainer) => void;
};
type EditorContextProps = PropsWithChildren<{}>;

export const EditorContext = createContext<EditorContextValue>({
  editor: null,
  setEditor: () => {},
});

export const useEditor = () => useContext(EditorContext);

export const EditorProvider = ({
  children,
}: PropsWithChildren<EditorContextProps>) => {
  const [editor, setEditor] = useState<EditorContainer | null>(null);

  return (
    <EditorContext.Provider value={{ editor, setEditor }}>
      {children}
    </EditorContext.Provider>
  );
};

export default EditorProvider;
