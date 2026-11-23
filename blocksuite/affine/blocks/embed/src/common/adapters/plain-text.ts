import type { BlockPlainTextAdapterMatcher } from '@blocksuite/affine-shared/adapters';

export function createEmbedBlockPlainTextAdapterMatcher(
  flavour: string,
  {
    toMatch = () => false,
    fromMatch = o => o.node.flavour === flavour,
    toBlockSnapshot = {},
    fromBlockSnapshot = {
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
  }: {
    toMatch?: BlockPlainTextAdapterMatcher['toMatch'];
    fromMatch?: BlockPlainTextAdapterMatcher['fromMatch'];
    toBlockSnapshot?: BlockPlainTextAdapterMatcher['toBlockSnapshot'];
    fromBlockSnapshot?: BlockPlainTextAdapterMatcher['fromBlockSnapshot'];
  } = {}
): BlockPlainTextAdapterMatcher {
  return {
    flavour,
    toMatch,
    fromMatch,
    toBlockSnapshot,
    fromBlockSnapshot,
  };
}
