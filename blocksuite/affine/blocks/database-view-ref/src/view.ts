import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { DatabaseViewRefBlockSchema } from '@blocksuite/affine-model';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';

import {
  GenericDatabaseViewRefSlashMenuConfigExtension,
  JournalTodoDatabaseSlashMenuConfigExtension,
  JournalTodoSourceSlashMenuConfigExtension,
} from './configs/slash-menu.js';
import { effects } from './effects.js';

const flavour = DatabaseViewRefBlockSchema.model.flavour;

export class DatabaseViewRefViewExtension extends ViewExtensionProvider {
  override name = 'affine-database-view-ref-block';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext): void {
    super.setup(context);
    context.register([
      FlavourExtension(flavour),
      JournalTodoDatabaseSlashMenuConfigExtension,
      GenericDatabaseViewRefSlashMenuConfigExtension,
      JournalTodoSourceSlashMenuConfigExtension,
      BlockViewExtension(flavour, literal`affine-database-view-ref`),
    ]);
  }
}
