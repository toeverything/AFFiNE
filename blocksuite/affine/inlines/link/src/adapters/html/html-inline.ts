import {
  type HtmlAST,
  HtmlASTToDeltaExtension,
} from '@blocksuite/affine-shared/adapters';
import type { Element } from 'hast';

const isElement = (ast: HtmlAST): ast is Element => {
  return ast.type === 'element';
};

export const htmlLinkElementToDeltaMatcher = HtmlASTToDeltaExtension({
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
    const { configs } = context;
    const baseUrl = configs.get('docLinkBaseUrl') ?? '';
    if (baseUrl && href.startsWith(baseUrl)) {
      const path = href.substring(baseUrl.length);
      //    ^ - /{pageId}?mode={mode}&blockIds={blockIds}&elementIds={elementIds}
      const match = path.match(/^\/([^?]+)(\?.*)?$/);
      if (match) {
        const pageId = match?.[1];
        const search = match?.[2];
        const searchParams = search ? new URLSearchParams(search) : undefined;
        const mode = searchParams?.get('mode');
        const blockIds = searchParams?.get('blockIds')?.split(',');
        const elementIds = searchParams?.get('elementIds')?.split(',');

        return [
          {
            insert: ' ',
            attributes: {
              reference: {
                type: 'LinkedPage',
                pageId,
                params: {
                  mode:
                    mode && ['edgeless', 'page'].includes(mode)
                      ? (mode as 'edgeless' | 'page')
                      : undefined,
                  blockIds,
                  elementIds,
                },
              },
            },
          },
        ];
      }
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
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
