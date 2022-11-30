import type { EditorContainer } from '@blocksuite/editor';
import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import dynamic from 'next/dynamic';
import Loading from './loading';

const DynamicEditor = dynamic(() => import('./initial-editor'), {
  ssr: false,
});

type EditorContextValue = {
  editor: EditorContainer | null;
  mode: EditorContainer['mode'];
  setMode: (mode: EditorContainer['mode']) => void;
};

type EditorContextProps = PropsWithChildren<{}>;

export const EditorContext = createContext<EditorContextValue>({
  editor: null,
  mode: 'page',
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
    <EditorContext.Provider value={{ editor, mode, setMode }}>
      <DynamicEditor setEditor={setEditor} />
      {editor ? children : <Loading />}
    </EditorContext.Provider>
  );
};

export default EditorProvider;
