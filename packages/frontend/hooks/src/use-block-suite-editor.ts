import type { AffineEditorContainer } from '@blocksuite/presets';
import { atom, type SetStateAction, useAtom } from 'jotai';

const editorContainerAtom = atom<AffineEditorContainer | null>(null);

export function useBlocksuiteEditor(): [
  AffineEditorContainer | null,
  React.Dispatch<SetStateAction<AffineEditorContainer | null>>,
] {
  const [editorContainer, setEditorContainer] = useAtom(editorContainerAtom);

  return [editorContainer, setEditorContainer];
}
