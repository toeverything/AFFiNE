import { CalloutBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  getCalloutEmoji,
  isCalloutNode,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';

// Currently, the callout block children can only be paragraph block or list block
// In mdast, the node types are `paragraph`, `list`, `heading`, `blockquote`
const CALLOUT_BLOCK_CHILDREN_TYPES = new Set([
  'paragraph',
  'list',
  'heading',
  'blockquote',
]);

export const calloutBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: CalloutBlockSchema.model.flavour,
  toMatch: o => isCalloutNode(o.node),
  fromMatch: o => o.node.flavour === CalloutBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!o.node.data || !isCalloutNode(o.node)) {
        return;
      }

      // Currently, the callout block children can only be a paragraph or a list
      // So we should filter out the other children
      o.node.children = o.node.children.filter(child =>
        CALLOUT_BLOCK_CHILDREN_TYPES.has(child.type)
      );

      const { walkerContext } = context;
      const calloutEmoji = getCalloutEmoji(o.node);
      walkerContext.openNode(
        {
          type: 'block',
          id: nanoid(),
          flavour: CalloutBlockSchema.model.flavour,
          props: {
            emoji: calloutEmoji,
          },
          children: [],
        },
        'children'
      );
    },
    leave: (o, context) => {
      const { walkerContext } = context;
      if (isCalloutNode(o.node)) {
        walkerContext.closeNode();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const emoji = o.node.props.emoji as string;
      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            type: 'blockquote',
            children: [],
          },
          'children'
        )
        .openNode({
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: `[!${emoji}]`,
            },
          ],
        })
        .closeNode();
    },
    leave: (_, context) => {
      const { walkerContext } = context;
      walkerContext.closeNode();
    },
  },
};

export const CalloutBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(calloutBlockMarkdownAdapterMatcher);
