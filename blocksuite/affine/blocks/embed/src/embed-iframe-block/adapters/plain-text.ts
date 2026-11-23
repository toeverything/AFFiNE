import { EmbedIframeBlockSchema } from '@blocksuite/affine-model';
import { BlockPlainTextAdapterExtension } from '@blocksuite/affine-shared/adapters';

import { createEmbedBlockPlainTextAdapterMatcher } from '../../common/adapters/plain-text';

export const embedIframeBlockPlainTextAdapterMatcher =
  createEmbedBlockPlainTextAdapterMatcher(
    EmbedIframeBlockSchema.model.flavour,
    {
      fromBlockSnapshot: {
        enter: (o, context) => {
          const { textBuffer } = context;
          // Parse as link
          if (
            typeof o.node.props.title !== 'string' ||
            typeof o.node.props.url !== 'string'
          ) {
            return;
          }
          const buffer = `[${o.node.props.title}](${o.node.props.url})`;
          if (buffer.length > 0) {
            textBuffer.content += buffer;
            textBuffer.content += '\n';
          }
        },
      },
    }
  );

export const EmbedIframeBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(embedIframeBlockPlainTextAdapterMatcher);
