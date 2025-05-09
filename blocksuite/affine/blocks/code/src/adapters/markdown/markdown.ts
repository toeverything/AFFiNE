import { CodeBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  CODE_BLOCK_WRAP_KEY,
  IN_PARAGRAPH_NODE_CONTEXT_KEY,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import type { Code, Html } from 'mdast';

const isCodeNode = (node: MarkdownAST): node is Code => node.type === 'code';
const isHtmlNode = (node: MarkdownAST): node is Html => node.type === 'html';

const isCodeOrHtmlNode = (node: MarkdownAST): node is Code | Html =>
  isCodeNode(node) || isHtmlNode(node);

export const codeBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: CodeBlockSchema.model.flavour,
  toMatch: o => isCodeOrHtmlNode(o.node),
  fromMatch: o => o.node.flavour === 'affine:code',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!isCodeOrHtmlNode(o.node)) {
        return;
      }

      const { walkerContext, configs } = context;
      const wrap = configs.get(CODE_BLOCK_WRAP_KEY) === 'true';
      let language = 'plain text';
      switch (o.node.type) {
        case 'code': {
          if (o.node.lang) {
            language = o.node.lang;
          }
          break;
        }
        case 'html': {
          const inParagraphNode = !!walkerContext.getGlobalContext(
            IN_PARAGRAPH_NODE_CONTEXT_KEY
          );
          // only handle top level html node
          if (inParagraphNode) {
            return;
          }
          language = 'html';
          break;
        }
      }
      walkerContext
        .openNode(
          {
            type: 'block',
            id: nanoid(),
            flavour: 'affine:code',
            props: {
              language,
              wrap,
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
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const text = (o.node.props.text ?? { delta: [] }) as {
        delta: DeltaInsert[];
      };
      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            type: 'code',
            lang: (o.node.props.language as string) ?? null,
            meta: null,
            value: text.delta.map(delta => delta.insert).join(''),
          },
          'children'
        )
        .closeNode();
    },
  },
};

export const CodeBlockMarkdownAdapterExtension = BlockMarkdownAdapterExtension(
  codeBlockMarkdownAdapterMatcher
);
