import { NoteBlockSchema } from '@blocksuite/affine-model';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import {
  DocNoteBlockAdapterExtensions,
  EdgelessNoteBlockAdapterExtensions,
} from './adapters/index';
import { NoteSlashMenuConfigExtension } from './configs/slash-menu';
import { createBuiltinToolbarConfigExtension } from './configs/toolbar';
import { NoteKeymapExtension } from './note-keymap.js';

const flavour = NoteBlockSchema.model.flavour;

export const NoteBlockSpec: ExtensionType[] = [
  FlavourExtension(flavour),
  BlockViewExtension(flavour, literal`affine-note`),
  DocNoteBlockAdapterExtensions,
  NoteSlashMenuConfigExtension,
  NoteKeymapExtension,
].flat();

export const EdgelessNoteBlockSpec: ExtensionType[] = [
  FlavourExtension(flavour),
  BlockViewExtension(flavour, literal`affine-edgeless-note`),
  EdgelessNoteBlockAdapterExtensions,
  NoteSlashMenuConfigExtension,
  createBuiltinToolbarConfigExtension(flavour),
  NoteKeymapExtension,
].flat();
