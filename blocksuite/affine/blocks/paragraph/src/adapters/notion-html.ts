import { ParagraphBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
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
  'div',
  'span',
  'figure',
]);

const NotionDatabaseTitleToken = '.collection-title';
const NotionPageLinkToken = '.link-to-page';
const NotionCalloutToken = '.callout';
const NotionCheckboxToken = '.checkbox';

export const paragraphBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: ParagraphBlockSchema.model.flavour,
    toMatch: o =>
      HastUtils.isElement(o.node) &&
      paragraphBlockMatchTags.has(o.node.tagName),
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const { walkerContext, deltaConverter, pageMap } = context;
        switch (o.node.tagName) {
          case 'blockquote': {
            walkerContext.setGlobalContext('hast:blockquote', true);
            walkerContext.openNode(
              {
                type: 'block',
                id: nanoid(),
                flavour: 'affine:paragraph',
                props: {
                  type: 'quote',
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: deltaConverter.astToDelta(
                      HastUtils.getInlineOnlyElementAST(o.node),
                      { pageMap, removeLastBr: true }
                    ),
                  },
                },
                children: [],
              },
              'children'
            );
            break;
          }
          case 'p': {
            // Workaround for Notion's bug
            // https://html.spec.whatwg.org/multipage/grouping-content.html#the-p-element
            if (!o.node.properties.id) {
              break;
            }
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
                    delta: deltaConverter.astToDelta(o.node, { pageMap }),
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
            if (HastUtils.querySelector(o.node, NotionDatabaseTitleToken)) {
              break;
            }
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
                      delta: deltaConverter.astToDelta(o.node, { pageMap }),
                    },
                  },
                  children: [],
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'figure':
            {
              // Notion page link
              if (HastUtils.querySelector(o.node, NotionPageLinkToken)) {
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
                          delta: deltaConverter.astToDelta(o.node, { pageMap }),
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

            // Notion callout
            if (HastUtils.querySelector(o.node, NotionCalloutToken)) {
              const firstElementChild = HastUtils.getElementChildren(o.node)[0];
              const secondElementChild = HastUtils.getElementChildren(
                o.node
              )[1];

              const iconSpan = HastUtils.querySelector(
                firstElementChild,
                '.icon'
              );
              const iconText = iconSpan
                ? HastUtils.getTextContent(iconSpan)
                : '';
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
                        delta: [
                          { insert: iconText + '\n' },
                          ...deltaConverter.astToDelta(secondElementChild, {
                            pageMap,
                          }),
                        ],
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
              !(
                o.parent.node.tagName === 'li' &&
                HastUtils.querySelector(o.parent.node, NotionCheckboxToken)
              ) &&
              Array.isArray(o.node.properties?.className)
            ) {
              if (o.node.properties.className.includes('indented')) {
                walkerContext.closeNode();
              }
            }
            break;
          }
          case 'blockquote': {
            walkerContext.closeNode();
            walkerContext.setGlobalContext('hast:blockquote', false);
            break;
          }
          case 'p': {
            if (!o.node.properties.id) {
              break;
            }
            if (
              o.next?.type === 'element' &&
              o.next.tagName === 'div' &&
              Array.isArray(o.next.properties?.className) &&
              o.next.properties.className.includes('indented')
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
    fromBlockSnapshot: {},
  };

export const ParagraphBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(paragraphBlockNotionHtmlAdapterMatcher);
