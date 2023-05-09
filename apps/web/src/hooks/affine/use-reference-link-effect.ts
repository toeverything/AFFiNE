import { useAtomValue } from 'jotai';
import { useEffect } from 'react';

import { currentEditorAtom } from '../../atoms';

export function useReferenceLinkEffect(props?: {
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

    const linkClickedDisposable = editor.slots.pageLinkClicked.on(
      ({ pageId }) => {
        pageLinkClicked?.({ pageId });
      }
    );

    // const subpageLinkedDisposable = editor.slots.subpageLinked.on(
    //   ({ pageId }) => {
    //     subpageLinked?.({ pageId });
    //   }
    // );
    // const subpageUnlinkedDisposable = editor.slots.subpageUnlinked.on(
    //   ({ pageId }) => {
    //     subpageUnlinked?.({ pageId });
    //   }
    // );

    return () => {
      linkClickedDisposable.dispose();
      // subpageLinkedDisposable.dispose();
      // subpageUnlinkedDisposable.dispose();
    };
  }, [editor, pageLinkClicked, subpageLinked, subpageUnlinked]);
}
