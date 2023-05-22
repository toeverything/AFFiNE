import { rootCurrentEditorAtom } from '@affine/workspace/atom';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';

export function useReferenceLinkEffect(props: {
  pageLinkClicked?: (params: { pageId: string }) => void;
}): void {
  const { pageLinkClicked } = props;
  const editor = useAtomValue(rootCurrentEditorAtom);

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
