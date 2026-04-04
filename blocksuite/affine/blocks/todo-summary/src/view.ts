import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { TodoSummaryBlockSchema } from '@blocksuite/affine-model';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';

import { todoSummarySlashMenuConfig } from './configs/slash-menu.js';
import { effects } from './effects.js';

const flavour = TodoSummaryBlockSchema.model.flavour;

export class TodoSummaryViewExtension extends ViewExtensionProvider {
  override name = 'affine-todo-summary-block';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register([
      FlavourExtension(flavour),
      BlockViewExtension(flavour, literal`affine-todo-summary`),
      SlashMenuConfigExtension(flavour, todoSummarySlashMenuConfig),
    ]);
  }
}
