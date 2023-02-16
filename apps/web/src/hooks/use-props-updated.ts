import { useEffect, useRef } from 'react';
import { EditorContainer } from '@blocksuite/editor';
import { useGlobalState } from '@/store/app';
export type EventCallBack<T> = (callback: (props: T) => void) => void;

export type UsePropsUpdated = (
  editor?: EditorContainer
) => EventCallBack<EditorContainer>;

export const usePropsUpdated: UsePropsUpdated = () => {
  const editor = useGlobalState(store => store.editor);

  const callbackQueue = useRef<((editor: EditorContainer) => void)[]>([]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    setTimeout(() => {
      editor.pageBlockModel?.propsUpdated.on(() => {
        callbackQueue.current.forEach(callback => {
          callback(editor);
        });
      });
    }, 300);

    return () => {
      callbackQueue.current = [];
      editor?.pageBlockModel?.propsUpdated?.dispose();
    };
  }, [editor]);

  return callback => {
    callbackQueue.current.push(callback);
  };
};

export default usePropsUpdated;
