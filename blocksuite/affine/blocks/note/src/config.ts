import type { NoteBlockModel } from '@blocksuite/affine-model';
import { type BlockStdScope, ConfigExtensionFactory } from '@blocksuite/std';
import type { TemplateResult } from 'lit';

type NoteBlockContext = {
  note: NoteBlockModel;
  std: BlockStdScope;
};

export type NoteConfig = {
  edgelessNoteHeader: (context: NoteBlockContext) => TemplateResult;
  pageBlockTitle: (context: NoteBlockContext) => TemplateResult;
  /**
   * @returns if the viewport fit animation executed
   */
  pageBlockViewportFitAnimation?: (context: NoteBlockContext) => boolean;
};

export const NoteConfigExtension =
  ConfigExtensionFactory<NoteConfig>('affine:note');
