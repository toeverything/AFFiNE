import { I18n } from '@affine/i18n';
import { FeatureFlagService } from '@blocksuite/affine/shared/services';
import {
  type SlashMenuConfig,
  SlashMenuConfigExtension,
} from '@blocksuite/affine/widgets/slash-menu';
import { ShapeIcon } from '@blocksuite/icons/lit';

import { SKETCH_WIDGET_SIZE, WHITEBOARD_FLAVOURS } from '../../const';
import { insertGfxWidget } from '../../insert-widget';
import { SketchBlockSchema } from './model';

const flavour = SketchBlockSchema.model.flavour;

const sketchSlashMenuConfig: SlashMenuConfig = {
  items: () => {
    return [
      {
        name: I18n['com.affine.whiteboard.sketch.slash-name'](),
        description: I18n['com.affine.whiteboard.sketch.slash-description'](),
        icon: ShapeIcon(),
        searchAlias: [
          'sketch',
          'excalidraw',
          'drawing',
          'wb:sketch',
          'набросок',
          'рисунок',
        ],
        group: '4_Content & Media@18',
        when: ({ std }) =>
          std.store.schema.flavourSchemaMap.has(flavour) &&
          std.get(FeatureFlagService).getFlag('enable_whiteboard_sketch'),
        action: ({ std }) => {
          insertGfxWidget(std, flavour, {}, SKETCH_WIDGET_SIZE);
        },
      },
    ];
  },
};

export const SketchSlashMenuConfigExtension = SlashMenuConfigExtension(
  WHITEBOARD_FLAVOURS.sketch,
  sketchSlashMenuConfig
);
