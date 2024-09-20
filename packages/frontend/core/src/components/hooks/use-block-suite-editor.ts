import type { AffineEditorContainer } from '@blocksuite/affine/presets';
import type { SetStateAction } from 'jotai';
import { atom, useAtom } from 'jotai';

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
