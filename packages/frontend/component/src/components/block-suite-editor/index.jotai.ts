import type { EditorContainer } from '@blocksuite/presets';
import { atom } from 'jotai';

export const editorContainerAtom = atom<EditorContainer | null>(null);
