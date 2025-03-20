import { FeatureFlagService } from '@blocksuite/affine-shared/services';
import type { SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { EmbedIcon } from '@blocksuite/icons/lit';

import { toggleEmbedIframeCreateModal } from '../../components/embed-iframe-create-modal';
import { EmbedIframeTooltip } from './tooltip';

export const embedIframeSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'Embed',
      description: 'For PDFs, and more.',
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
      action: ({ std, model }) => {
        (async () => {
          const { host } = std;
          const parentModel = host.doc.getParent(model);
          if (!parentModel) {
            return;
          }
          const index = parentModel.children.indexOf(model) + 1;
          await toggleEmbedIframeCreateModal(std, {
            parentModel,
            index,
            variant: 'default',
          });
          if (model.text?.length === 0) std.store.deleteBlock(model);
        })().catch(console.error);
      },
    },
  ],
};
