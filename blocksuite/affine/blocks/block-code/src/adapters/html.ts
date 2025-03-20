import { CodeBlockSchema } from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
  CODE_BLOCK_WRAP_KEY,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import { bundledLanguagesInfo, codeToHast } from 'shiki';

export const codeBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: CodeBlockSchema.model.flavour,
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'pre',
  fromMatch: o => o.node.flavour === 'affine:code',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const code = HastUtils.querySelector(o.node, 'code');
      if (!code) {
        return;
      }

      const codeText =
        code.children.length === 1 && code.children[0].type === 'text'
          ? code.children[0]
          : { ...code, tagName: 'div' };
      let codeLang = Array.isArray(code.properties?.className)
        ? code.properties.className.find(
            className =>
              typeof className === 'string' && className.startsWith('code-')
          )
        : undefined;
      codeLang =
        typeof codeLang === 'string'
          ? codeLang.replace('code-', '')
          : undefined;

      const { walkerContext, deltaConverter, configs } = context;
      const wrap = configs.get(CODE_BLOCK_WRAP_KEY) === 'true';
      walkerContext
        .openNode(
          {
            type: 'block',
            id: nanoid(),
            flavour: 'affine:code',
            props: {
              language: codeLang ?? 'Plain Text',
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
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const { walkerContext } = context;
      const rawLang = o.node.props.language as string | null;
      const matchedLang = rawLang
        ? (bundledLanguagesInfo.find(
            info =>
              info.id === rawLang ||
              info.name === rawLang ||
              info.aliases?.includes(rawLang)
          )?.id ?? 'text')
        : 'text';

      const text = (o.node.props.text as Record<string, unknown>)
        .delta as DeltaInsert[];
      const code = text.map(delta => delta.insert).join('');
      const hast = await codeToHast(code, {
        lang: matchedLang,
        theme: 'light-plus',
      });

      walkerContext.openNode(hast as never, 'children').closeNode();
    },
  },
};

export const CodeBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  codeBlockHtmlAdapterMatcher
);
