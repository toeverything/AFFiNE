import { useAtomValue } from 'jotai';
import { useEffect } from 'react';

import { currentEditorAtom } from '../../atoms';

export function useReference(props?: {
  pageLinkClicked?: (params: { pageId: string }) => void;
  subpageLinked?: (params: { pageId: string }) => void;
  subpageUnlinked?: (params: { pageId: string }) => void;
}) {
  const { pageLinkClicked, subpageLinked, subpageUnlinked } = props ?? {};
  const editor = useAtomValue(currentEditorAtom);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.slots.pageLinkClicked.on(({ pageId }) => {
      pageLinkClicked?.({ pageId });
    });

    editor.slots.subpageLinked.on(({ pageId }) => {
      subpageLinked?.({ pageId });
    });
    editor.slots.subpageUnlinked.on(({ pageId }) => {
      subpageUnlinked?.({ pageId });
    });

    return () => {
      editor.slots.pageLinkClicked.dispose();
      editor.slots.subpageLinked.dispose();
      editor.slots.subpageUnlinked.dispose();
    };
  }, [editor, pageLinkClicked, subpageLinked, subpageUnlinked]);
}
