import type { SetStateAction } from 'jotai';
import { atom, useAtom } from 'jotai';

import type { AffineEditorContainer } from '../../blocksuite/block-suite-editor';

const activeEditorContainerAtom = atom<AffineEditorContainer | null>(null);

export function useActiveBlocksuiteEditor(): [
  AffineEditorContainer | null,
  React.Dispatch<SetStateAction<AffineEditorContainer | null>>,
] {
  const [editorContainer, setEditorContainer] = useAtom(
    activeEditorContainerAtom
  );

  return [editorContainer, setEditorContainer];
}
