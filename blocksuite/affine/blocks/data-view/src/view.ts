import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';

import { DataViewBlockSchema } from './data-view-model';
import { effects } from './effects';

const flavour = DataViewBlockSchema.model.flavour;

export class DataViewViewExtension extends ViewExtensionProvider {
  override name = 'affine-data-view-block';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register([
      FlavourExtension(flavour),
      BlockViewExtension(flavour, literal`affine-data-view`),
    ]);
  }
}
