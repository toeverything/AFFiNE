import { DefaultTool } from '@blocksuite/affine-block-surface';
import { toggleEmbedCardCreateModal } from '@blocksuite/affine-components/embed-card-modal';
import type { SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { YoutubeDuotoneIcon } from '@blocksuite/icons/lit';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';

import { YoutubeVideoTooltip } from './tooltips';

export const embedYoutubeSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'YouTube',
      description: 'Embed a YouTube video.',
      icon: YoutubeDuotoneIcon(),
      tooltip: {
        figure: YoutubeVideoTooltip,
        caption: 'YouTube Video',
      },
      group: '4_Content & Media@6',
      when: ({ model }) =>
        model.store.schema.flavourSchemaMap.has('affine:embed-youtube'),
      action: ({ std, model }) => {
        (async () => {
          const { host } = std;
          const parentModel = host.store.getParent(model);
          if (!parentModel) {
            return;
          }
          const index = parentModel.children.indexOf(model) + 1;
          await toggleEmbedCardCreateModal(
            host,
            'YouTube',
            'The added YouTube video link will be displayed as an embed view.',
            { mode: 'page', parentModel, index },
            ({ mode }) => {
              if (mode === 'edgeless') {
                const gfx = std.get(GfxControllerIdentifier);
                gfx.tool.setTool(DefaultTool);
              }
            }
          );
          if (model.text?.length === 0) std.store.deleteBlock(model);
        })().catch(console.error);
      },
    },
  ],
};
