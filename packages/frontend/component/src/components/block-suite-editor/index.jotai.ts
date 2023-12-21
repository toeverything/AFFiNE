import type { AffineEditorContainer } from '@blocksuite/presets';
import { atom } from 'jotai';

export const editorContainerAtom = atom<AffineEditorContainer | null>(null);
