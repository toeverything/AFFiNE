import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { DatabaseRefBlockSchema } from '@blocksuite/affine-model';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';

import { DatabaseRefSlashMenuConfigExtension } from './configs/slash-menu';
import { effects } from './effects';

const flavour = DatabaseRefBlockSchema.model.flavour;

export class DatabaseRefViewExtension extends ViewExtensionProvider {
  override name = 'affine-database-ref-block';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext): void {
    super.setup(context);
    context.register([
      FlavourExtension(flavour),
      DatabaseRefSlashMenuConfigExtension,
      BlockViewExtension(flavour, literal`affine-database-ref`),
    ]);
  }
}
