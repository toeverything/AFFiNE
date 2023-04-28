import { useAtomValue } from 'jotai';
import { useEffect } from 'react';

import { currentEditorAtom } from '../../atoms';

export function useReferenceLinkEffect(props?: {
  pageLinkClicked?: (params: { pageId: string }) => void;
}) {
  const { pageLinkClicked } = props ?? {};
  const editor = useAtomValue(currentEditorAtom);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const linkClickedDisposable = editor.slots.pageLinkClicked.on(
      ({ pageId }) => {
        pageLinkClicked?.({ pageId });
      }
    );

    return () => {
      linkClickedDisposable.dispose();
    };
  }, [editor, pageLinkClicked]);
}
