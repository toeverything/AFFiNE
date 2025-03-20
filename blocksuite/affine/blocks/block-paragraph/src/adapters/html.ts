import { ParagraphBlockSchema } from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
  HastUtils,
  type HtmlAST,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert, NodeProps } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';

const paragraphBlockMatchTags = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'body',
  'div',
  'span',
  'footer',
]);

const tagsInAncestor = (o: NodeProps<HtmlAST>, tagNames: Array<string>) => {
  let parent = o.parent;
  while (parent) {
    if (
      HastUtils.isElement(parent.node) &&
      tagNames.includes(parent.node.tagName)
    ) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
};

export const paragraphBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: ParagraphBlockSchema.model.flavour,
  toMatch: o =>
    HastUtils.isElement(o.node) && paragraphBlockMatchTags.has(o.node.tagName),
  fromMatch: o => o.node.flavour === ParagraphBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const { walkerContext, deltaConverter } = context;
      switch (o.node.tagName) {
        case 'blockquote': {
          walkerContext.setGlobalContext('hast:blockquote', true);
          // Special case for no paragraph in blockquote
          const texts = HastUtils.getTextChildren(o.node);
          // check if only blank text
          const onlyBlankText = texts.every(text => !text.value.trim());
          if (texts && !onlyBlankText) {
            walkerContext
              .openNode(
                {
                  type: 'block',
                  id: nanoid(),
                  flavour: 'affine:paragraph',
                  props: {
                    type: 'quote',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: deltaConverter.astToDelta(
                        HastUtils.getTextChildrenOnlyAst(o.node)
                      ),
                    },
                  },
                  children: [],
                },
                'children'
              )
              .closeNode();
          }
          break;
        }
        case 'body':
        case 'div':
        case 'span':
        case 'footer': {
          if (
            o.parent?.node.type === 'element' &&
            !tagsInAncestor(o, ['p', 'li']) &&
            HastUtils.isParagraphLike(o.node)
          ) {
            walkerContext
              .openNode(
                {
                  type: 'block',
                  id: nanoid(),
                  flavour: 'affine:paragraph',
                  props: {
                    type: 'text',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: deltaConverter.astToDelta(o.node),
                    },
                  },
                  children: [],
                },
                'children'
              )
              .closeNode();
            walkerContext.skipAllChildren();
          }
          break;
        }
        case 'p': {
          walkerContext.openNode(
            {
              type: 'block',
              id: nanoid(),
              flavour: 'affine:paragraph',
              props: {
                type: walkerContext.getGlobalContext('hast:blockquote')
                  ? 'quote'
                  : 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: deltaConverter.astToDelta(o.node),
                },
              },
              children: [],
            },
            'children'
          );
          break;
        }
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          walkerContext
            .openNode(
              {
                type: 'block',
                id: nanoid(),
                flavour: 'affine:paragraph',
                props: {
                  type: o.node.tagName,
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: deltaConverter.astToDelta(o.node),
                  },
                },
                children: [],
              },
              'children'
            )
            .closeNode();
          walkerContext.skipAllChildren();
          break;
        }
      }
    },
    leave: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const { walkerContext } = context;
      switch (o.node.tagName) {
        case 'div': {
          // eslint-disable-next-line sonarjs/no-collapsible-if
          if (
            o.parent?.node.type === 'element' &&
            o.parent.node.tagName !== 'li' &&
            Array.isArray(o.node.properties?.className)
          ) {
            if (
              o.node.properties.className.includes(
                'affine-paragraph-block-container'
              ) ||
              o.node.properties.className.includes(
                'affine-block-children-container'
              ) ||
              o.node.properties.className.includes('indented')
            ) {
              walkerContext.closeNode();
            }
          }
          break;
        }
        case 'blockquote': {
          walkerContext.setGlobalContext('hast:blockquote', false);
          break;
        }
        case 'p': {
          if (
            o.next?.type === 'element' &&
            o.next.tagName === 'div' &&
            Array.isArray(o.next.properties?.className) &&
            (o.next.properties.className.includes(
              'affine-block-children-container'
            ) ||
              o.next.properties.className.includes('indented'))
          ) {
            // Close the node when leaving div indented
            break;
          }
          walkerContext.closeNode();
          break;
        }
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const text = (o.node.props.text ?? { delta: [] }) as {
        delta: DeltaInsert[];
      };
      const { walkerContext, deltaConverter } = context;
      switch (o.node.props.type) {
        case 'text': {
          walkerContext
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-paragraph-block-container'],
                },
                children: [],
              },
              'children'
            )
            .openNode(
              {
                type: 'element',
                tagName: 'p',
                properties: {},
                children: deltaConverter.deltaToAST(text.delta),
              },
              'children'
            )
            .closeNode()
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-block-children-container'],
                  style: 'padding-left: 26px;',
                },
                children: [],
              },
              'children'
            );
          break;
        }
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          walkerContext
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-paragraph-block-container'],
                },
                children: [],
              },
              'children'
            )
            .openNode(
              {
                type: 'element',
                tagName: o.node.props.type,
                properties: {},
                children: deltaConverter.deltaToAST(text.delta),
              },
              'children'
            )
            .closeNode()
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-block-children-container'],
                  style: 'padding-left: 26px;',
                },
                children: [],
              },
              'children'
            );
          break;
        }
        case 'quote': {
          walkerContext
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-paragraph-block-container'],
                },
                children: [],
              },
              'children'
            )
            .openNode(
              {
                type: 'element',
                tagName: 'blockquote',
                properties: {
                  className: ['quote'],
                },
                children: [],
              },
              'children'
            )
            .openNode(
              {
                type: 'element',
                tagName: 'p',
                properties: {},
                children: deltaConverter.deltaToAST(text.delta),
              },
              'children'
            )
            .closeNode()
            .closeNode()
            .openNode(
              {
                type: 'element',
                tagName: 'div',
                properties: {
                  className: ['affine-block-children-container'],
                  style: 'padding-left: 26px;',
                },
                children: [],
              },
              'children'
            );
          break;
        }
      }
    },
    leave: (_, context) => {
      const { walkerContext } = context;
      walkerContext.closeNode().closeNode();
    },
  },
};

export const ParagraphBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  paragraphBlockHtmlAdapterMatcher
);
