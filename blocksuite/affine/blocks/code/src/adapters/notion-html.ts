import { CodeBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  CODE_BLOCK_WRAP_KEY,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';

export const codeBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: CodeBlockSchema.model.flavour,
    toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'pre',
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const code = HastUtils.querySelector(o.node, 'code');
        if (!code) {
          return;
        }
        const { walkerContext, deltaConverter, configs } = context;
        const wrap = configs.get(CODE_BLOCK_WRAP_KEY) === 'true';
        const codeText =
          code.children.length === 1 && code.children[0].type === 'text'
            ? code.children[0]
            : { ...code, tag: 'div' };
        walkerContext
          .openNode(
            {
              type: 'block',
              id: nanoid(),
              flavour: CodeBlockSchema.model.flavour,
              props: {
                language: 'Plain Text',
                wrap,
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: deltaConverter.astToDelta(codeText, {
                    trim: false,
                    pre: true,
                  }),
                },
              },
              children: [],
            },
            'children'
          )
          .closeNode();
        walkerContext.skipAllChildren();
      },
    },
    fromBlockSnapshot: {},
  };

export const CodeBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(codeBlockNotionHtmlAdapterMatcher);
