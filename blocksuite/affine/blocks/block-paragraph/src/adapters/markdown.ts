import { ParagraphBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import type { Heading } from 'mdast';

const PARAGRAPH_MDAST_TYPE = new Set([
  'paragraph',
  'html',
  'heading',
  'blockquote',
]);

const isParagraphMDASTType = (node: MarkdownAST) =>
  PARAGRAPH_MDAST_TYPE.has(node.type);

export const paragraphBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher =
  {
    flavour: ParagraphBlockSchema.model.flavour,
    toMatch: o => isParagraphMDASTType(o.node),
    fromMatch: o => o.node.flavour === ParagraphBlockSchema.model.flavour,
    toBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext, deltaConverter } = context;
        switch (o.node.type) {
          case 'html': {
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
                      delta: [
                        {
                          insert: o.node.value,
                        },
                      ],
                    },
                  },
                  children: [],
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'paragraph': {
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
            break;
          }
          case 'heading': {
            walkerContext
              .openNode(
                {
                  type: 'block',
                  id: nanoid(),
                  flavour: 'affine:paragraph',
                  props: {
                    type: `h${o.node.depth}`,
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
            break;
          }
          case 'blockquote': {
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
    },
    fromBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext, deltaConverter } = context;
        const paragraphDepth = (walkerContext.getGlobalContext(
          'affine:paragraph:depth'
        ) ?? 0) as number;
        const text = (o.node.props.text ?? { delta: [] }) as {
          delta: DeltaInsert[];
        };
        switch (o.node.props.type) {
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6': {
            walkerContext
              .openNode(
                {
                  type: 'heading',
                  depth: parseInt(o.node.props.type[1]) as Heading['depth'],
                  children: deltaConverter.deltaToAST(
                    text.delta,
                    paragraphDepth
                  ),
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'text': {
            walkerContext
              .openNode(
                {
                  type: 'paragraph',
                  children: deltaConverter.deltaToAST(
                    text.delta,
                    paragraphDepth
                  ),
                },
                'children'
              )
              .closeNode();
            break;
          }
          case 'quote': {
            walkerContext
              .openNode(
                {
                  type: 'blockquote',
                  children: [],
                },
                'children'
              )
              .openNode(
                {
                  type: 'paragraph',
                  children: deltaConverter.deltaToAST(text.delta),
                },
                'children'
              )
              .closeNode()
              .closeNode();
            break;
          }
        }
        walkerContext.setGlobalContext(
          'affine:paragraph:depth',
          paragraphDepth + 1
        );
      },
      leave: (_, context) => {
        const { walkerContext } = context;
        walkerContext.setGlobalContext(
          'affine:paragraph:depth',
          (walkerContext.getGlobalContext('affine:paragraph:depth') as number) -
            1
        );
      },
    },
  };

export const ParagraphBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(paragraphBlockMarkdownAdapterMatcher);
