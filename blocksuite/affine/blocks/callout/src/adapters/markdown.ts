import { CalloutBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  CALLOUT_MARKDOWN_EXPORT_OPTIONS_KEY,
  type CalloutAdmonitionType,
  CalloutAdmonitionTypeSet,
  CalloutExportStyle,
  type CalloutMarkdownExportOptions,
  calloutMarkdownExportOptionsSchema,
  DEFAULT_ADMONITION_TYPE,
  getCalloutEmoji,
  isCalloutNode,
} from '@blocksuite/affine-shared/adapters';
import { type DeltaInsert, nanoid } from '@blocksuite/store';

// Currently, the callout block children can only be paragraph block or list block
// In mdast, the node types are `paragraph`, `list`, `heading`, `blockquote`
const CALLOUT_BLOCK_CHILDREN_TYPES = new Set([
  'paragraph',
  'list',
  'heading',
  'blockquote',
]);

const ADMONITION_SYMBOL = ':::';
const DEFAULT_OPTIONS: CalloutMarkdownExportOptions = {
  style: CalloutExportStyle.GFM,
};

/**
 * Get the callout export options from the configs
 * @param configs - The configs of the callout block
 * @returns The callout export options
 */
function getCalloutExportOptions(
  configs: Map<string, unknown>
): CalloutMarkdownExportOptions {
  let exportOptions: CalloutMarkdownExportOptions = DEFAULT_OPTIONS;
  try {
    const options = configs.get(CALLOUT_MARKDOWN_EXPORT_OPTIONS_KEY);
    if (options) {
      exportOptions = calloutMarkdownExportOptionsSchema.parse(options);
    }
  } catch {}
  return exportOptions;
}

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
      const { walkerContext, configs } = context;

      const exportOptions = getCalloutExportOptions(configs);
      const { style, admonitionType } = exportOptions;
      // If the style is admonitions, we should handle the first child
      if (style === CalloutExportStyle.Admonitions) {
        let type = admonitionType ?? DEFAULT_ADMONITION_TYPE;
        let customTitle = '';
        let restOfText = '';

        const firstChild = o.node.children[0];
        const isTextNode = !!firstChild.props.text;
        // If the first child is a text block, we should get the type and custom title from the first line of the text
        // And remove the first child from the children
        // Otherwise, we should use the default admonition type as the type
        if (isTextNode) {
          const textDelta = (firstChild.props.text ?? { delta: [] }) as {
            delta: DeltaInsert[];
          };
          // Get the text of the first child
          const text = textDelta.delta.reduce((acc, delta) => {
            if (delta.insert) {
              acc += delta.insert;
            }
            return acc;
          }, '');

          // If the text is not empty, we should try to get type and custom title from the text
          if (text) {
            // Get the first line of the text
            const firstLine = text.includes('\n') ? text.split('\n')[0] : text;
            // Get the rest of the text besides the first line
            restOfText = text.split('\n').slice(1).join('\n');
            // Get the possible type from the first line
            const possibleType = firstLine.split(' ')[0].toLowerCase();
            // If the type is a valid admonition type, we should use it as the type
            if (CalloutAdmonitionTypeSet.has(possibleType)) {
              type = possibleType as CalloutAdmonitionType;
              // Get the custom title from the first line
              customTitle = firstLine.split(' ').slice(1).join(' ').trim();
              // Remove the first child from the children
              o.node.children = o.node.children.slice(1);
            }
          }
        }

        // Add an admonition symbol paragraph to the start of the children
        const admonitionSymbol =
          `${ADMONITION_SYMBOL} ${type} ${customTitle}`.trim();
        walkerContext
          .openNode({
            type: 'paragraph',
            children: [
              {
                type: 'text',
                value: admonitionSymbol,
              },
            ],
          })
          .closeNode();

        // Add the rest of the text to the children content
        if (restOfText) {
          walkerContext
            .openNode({
              type: 'paragraph',
              children: [{ type: 'text', value: `${restOfText}` }],
            })
            .closeNode();
        }
      } else {
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
      }
    },
    leave: (_, context) => {
      const { walkerContext, configs } = context;
      const exportOptions = getCalloutExportOptions(configs);
      const { style } = exportOptions;
      // If the style is admonitions, we should add an admonition symbol paragraph to the end of the children
      if (style === CalloutExportStyle.Admonitions) {
        walkerContext
          .openNode({
            type: 'paragraph',
            children: [
              {
                type: 'text',
                value: ADMONITION_SYMBOL,
              },
            ],
          })
          .closeNode();
      } else {
        // If the style is gfm, we should close the outer blockquote node
        walkerContext.closeNode();
      }
    },
  },
};

export const CalloutBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(calloutBlockMarkdownAdapterMatcher);
