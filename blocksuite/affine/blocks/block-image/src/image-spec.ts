import { ImageBlockSchema } from '@blocksuite/affine-model';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import {
  BlockViewExtension,
  FlavourExtension,
  WidgetViewExtension,
} from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { ImageBlockAdapterExtensions } from './adapters/extension';
import { imageSlashMenuConfig } from './configs/slash-menu';
import { createBuiltinToolbarConfigExtension } from './configs/toolbar';
import { ImageProxyService } from './image-proxy-service';
import { ImageDropOption } from './image-service';

const flavour = ImageBlockSchema.model.flavour;

export const imageToolbarWidget = WidgetViewExtension(
  flavour,
  'imageToolbar',
  literal`affine-image-toolbar-widget`
);

export const ImageBlockSpec: ExtensionType[] = [
  FlavourExtension(flavour),
  BlockViewExtension(flavour, model => {
    const parent = model.doc.getParent(model.id);

    if (parent?.flavour === 'affine:surface') {
      return literal`affine-edgeless-image`;
    }

    return literal`affine-image`;
  }),
  imageToolbarWidget,
  ImageDropOption,
  ImageBlockAdapterExtensions,
  createBuiltinToolbarConfigExtension(flavour),
  SlashMenuConfigExtension(flavour, imageSlashMenuConfig),
].flat();

export const ImageStoreSpec: ExtensionType[] = [ImageProxyService];
