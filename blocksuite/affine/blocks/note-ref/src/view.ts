import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { NoteRefBlockSchema } from '@blocksuite/affine-model';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';

import { NoteRefSlashMenuConfigExtension } from './configs/slash-menu';
import { createNoteRefBuiltinToolbarConfigExtension } from './configs/toolbar';
import { effects } from './effects';

const flavour = NoteRefBlockSchema.model.flavour;

export class NoteRefViewExtension extends ViewExtensionProvider {
  override name = 'affine-note-ref-block';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext): void {
    super.setup(context);
    context.register([
      FlavourExtension(flavour),
      NoteRefSlashMenuConfigExtension,
      BlockViewExtension(flavour, literal`affine-note-ref`),
      ...createNoteRefBuiltinToolbarConfigExtension(flavour),
    ]);
  }
}
