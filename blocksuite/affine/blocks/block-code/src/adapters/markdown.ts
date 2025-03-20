import { CodeBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  CODE_BLOCK_WRAP_KEY,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import type { Code } from 'mdast';

const isCodeNode = (node: MarkdownAST): node is Code => node.type === 'code';

export const codeBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: CodeBlockSchema.model.flavour,
  toMatch: o => isCodeNode(o.node),
  fromMatch: o => o.node.flavour === 'affine:code',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!isCodeNode(o.node)) {
        return;
      }
      const { walkerContext, configs } = context;
      const wrap = configs.get(CODE_BLOCK_WRAP_KEY) === 'true';
      walkerContext
        .openNode(
          {
            type: 'block',
            id: nanoid(),
            flavour: 'affine:code',
            props: {
              language: o.node.lang ?? 'Plain Text',
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
