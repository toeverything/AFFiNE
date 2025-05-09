import { EmbedYoutubeBlockSchema } from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';

import { createEmbedBlockHtmlAdapterMatcher } from '../../common/adapters/html.js';

export const embedYoutubeBlockHtmlAdapterMatcher =
  createEmbedBlockHtmlAdapterMatcher(EmbedYoutubeBlockSchema.model.flavour, {
    toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'iframe',
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }

        const src = o.node.properties?.src;
        if (typeof src !== 'string') {
          return;
        }

        const { walkerContext } = context;
        if (src.startsWith('https://www.youtube.com/embed/')) {
          const videoId = src.substring(
            'https://www.youtube.com/embed/'.length,
            src.indexOf('?') !== -1 ? src.indexOf('?') : undefined
          );
          walkerContext
            .openNode(
              {
                type: 'block',
                id: nanoid(),
                flavour: 'affine:embed-youtube',
                props: {
                  url: `https://www.youtube.com/watch?v=${videoId}`,
                },
                children: [],
              },
              'children'
            )
            .closeNode();
        }
      },
    },
  });

export const EmbedYoutubeBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  embedYoutubeBlockHtmlAdapterMatcher
);
