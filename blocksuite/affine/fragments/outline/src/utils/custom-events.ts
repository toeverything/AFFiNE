import type { NoteBlockModel, NoteDisplayMode } from '@blocksuite/affine-model';

export type ReorderEvent = CustomEvent<{
  currentNumber: number;
  targetNumber: number;
  realIndex: number;
}>;

export type SelectEvent = CustomEvent<{
  id: string;
  selected: boolean;
  number: number;
  multiselect: boolean;
}>;

export type FitViewEvent = CustomEvent<{
  block: NoteBlockModel;
}>;

export type ClickBlockEvent = CustomEvent<{
  blockId: string;
}>;

export type DisplayModeChangeEvent = CustomEvent<{
  note: NoteBlockModel;
  newMode: NoteDisplayMode;
}>;
