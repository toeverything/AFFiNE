import { useEffect, useRef } from 'react';
import { EditorContainer } from '@blocksuite/editor';
import { EventCallBack } from '../interface';

export type UsePropsUpdated = (
  editor?: EditorContainer
) => EventCallBack<EditorContainer>;

export const usePropsUpdated: UsePropsUpdated = editor => {
  const callbackQueue = useRef<((editor: EditorContainer) => void)[]>([]);

  useEffect(() => {
    if (!editor?.model) {
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
