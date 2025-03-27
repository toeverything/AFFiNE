import { getSelectedModelsCommand } from '@blocksuite/affine-shared/commands';
import { FeatureFlagService } from '@blocksuite/affine-shared/services';
import type { SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { EmbedIcon } from '@blocksuite/icons/lit';

import { insertEmptyEmbedIframeCommand } from '../../commands/insert-empty-embed-iframe';
import { EmbedIframeTooltip } from './tooltip';

export const embedIframeSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'Embed',
      description: 'For Google Drive, and more.',
      icon: EmbedIcon(),
      tooltip: {
        figure: EmbedIframeTooltip,
        caption: 'Embed',
      },
      group: '4_Content & Media@10',
      when: ({ model, std }) => {
        const featureFlagService = std.get(FeatureFlagService);
        return (
          featureFlagService.getFlag('enable_embed_iframe_block') &&
          model.doc.schema.flavourSchemaMap.has('affine:embed-iframe')
        );
      },
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(insertEmptyEmbedIframeCommand, {
            place: 'after',
            removeEmptyLine: true,
          })
          .run();
      },
    },
  ],
};
