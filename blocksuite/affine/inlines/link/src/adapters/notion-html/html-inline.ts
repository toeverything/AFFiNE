import {
  type HtmlAST,
  NotionHtmlASTToDeltaExtension,
} from '@blocksuite/affine-shared/adapters';
import type { Element } from 'hast';

const isElement = (ast: HtmlAST): ast is Element => {
  return ast.type === 'element';
};

export const notionHtmlLinkElementToDeltaMatcher =
  NotionHtmlASTToDeltaExtension({
    name: 'link-element',
    match: ast => isElement(ast) && ast.tagName === 'a',
    toDelta: (ast, context) => {
      if (!isElement(ast)) {
        return [];
      }

      const href = ast.properties?.href;
      if (typeof href !== 'string') {
        return [];
      }
      const { toDelta, options } = context;
      return ast.children.flatMap(child =>
        toDelta(child, options).map(delta => {
          if (options.pageMap) {
            const pageId = options.pageMap.get(decodeURIComponent(href));
            if (pageId) {
              delta.attributes = {
                ...delta.attributes,
                reference: {
                  type: 'LinkedPage',
                  pageId,
                },
              };
              delta.insert = ' ';
              return delta;
            }
          }
          if (href.startsWith('http')) {
            delta.attributes = {
              ...delta.attributes,
              link: href,
            };
            return delta;
          }
          return delta;
        })
      );
    },
  });
