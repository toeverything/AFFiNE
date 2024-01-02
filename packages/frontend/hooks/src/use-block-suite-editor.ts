import type { AffineEditorContainer } from '@blocksuite/presets';
import { atom, type SetStateAction, useAtom } from 'jotai';

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
