import type { PropertyModel } from '@blocksuite/data-view';
import { propertyModelPresets } from '@blocksuite/data-view/property-pure-presets';

import { linkPropertyModelConfig } from './link/define';
import { richTextPropertyModelConfig } from './rich-text/define';
import { titlePropertyModelConfig } from './title/define';

export const databaseBlockModels = Object.fromEntries(
  [
    propertyModelPresets.checkboxPropertyModelConfig,
    propertyModelPresets.datePropertyModelConfig,
    propertyModelPresets.numberPropertyModelConfig,
    propertyModelPresets.progressPropertyModelConfig,
    propertyModelPresets.selectPropertyModelConfig,
    propertyModelPresets.multiSelectPropertyModelConfig,
    linkPropertyModelConfig,
    richTextPropertyModelConfig,
    titlePropertyModelConfig,
  ].map(v => [v.type, v as PropertyModel])
);
