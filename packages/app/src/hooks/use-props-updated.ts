import { useEffect, useRef } from 'react';
import { EditorContainer } from '@blocksuite/editor';
import { useAppState } from '@/providers/app-state-provider';
export type EventCallBack<T> = (callback: (props: T) => void) => void;

export type UsePropsUpdated = (
  editor?: EditorContainer
) => EventCallBack<EditorContainer>;

export const usePropsUpdated: UsePropsUpdated = () => {
  const { editor } = useAppState();

  const callbackQueue = useRef<((editor: EditorContainer) => void)[]>([]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    setTimeout(() => {
      editor.model?.propsUpdated.on(() => {
        callbackQueue.current.forEach(callback => {
          callback(editor);
        });
      });
    }, 300);

    return () => {
      callbackQueue.current = [];
      editor?.model?.propsUpdated.dispose();
    };
  }, [editor]);

  return callback => {
    callbackQueue.current.push(callback);
  };
};

export default usePropsUpdated;
