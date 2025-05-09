import {
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';

export function createEmbedBlockNotionHtmlAdapterMatcher(
  flavour: string,
  urlRegex: RegExp,
  {
    toMatch = o => {
      const isFigure =
        HastUtils.isElement(o.node) && o.node.tagName === 'figure';
      const embededFigureWrapper = HastUtils.querySelector(o.node, '.source');
      if (!isFigure || !embededFigureWrapper) {
        return false;
      }
      const embededURL = HastUtils.querySelector(embededFigureWrapper, 'a')
        ?.properties.href;

      if (!embededURL || typeof embededURL !== 'string') {
        return false;
      }
      // To avoid polynomial regular expression used on uncontrolled data
      // https://codeql.github.com/codeql-query-help/javascript/js-polynomial-redos/
      if (embededURL.length > 1000) {
        return false;
      }
      return urlRegex.test(embededURL);
    },
    fromMatch = o => o.node.flavour === flavour,
    toBlockSnapshot = {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const { assets, walkerContext } = context;
        if (!assets) {
          return;
        }

        const embededFigureWrapper = HastUtils.querySelector(o.node, '.source');
        if (!embededFigureWrapper) {
          return;
        }

        let embededURL = '';
        const embedA = HastUtils.querySelector(embededFigureWrapper, 'a');
        embededURL =
          typeof embedA?.properties.href === 'string'
            ? embedA.properties.href
            : '';
        if (!embededURL) {
          return;
        }

        walkerContext
          .openNode(
            {
              type: 'block',
              id: nanoid(),
              flavour,
              props: {
                url: embededURL,
              },
              children: [],
            },
            'children'
          )
          .closeNode();
        walkerContext.skipAllChildren();
      },
    },
    fromBlockSnapshot = {},
  }: {
    toMatch?: BlockNotionHtmlAdapterMatcher['toMatch'];
    fromMatch?: BlockNotionHtmlAdapterMatcher['fromMatch'];
    toBlockSnapshot?: BlockNotionHtmlAdapterMatcher['toBlockSnapshot'];
    fromBlockSnapshot?: BlockNotionHtmlAdapterMatcher['fromBlockSnapshot'];
  } = Object.create(null)
): BlockNotionHtmlAdapterMatcher {
  return {
    flavour,
    toMatch,
    fromMatch,
    toBlockSnapshot,
    fromBlockSnapshot,
  };
}
