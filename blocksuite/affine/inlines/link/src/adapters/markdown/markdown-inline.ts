import { MarkdownASTToDeltaExtension } from '@blocksuite/affine-shared/adapters';

export const markdownLinkToDeltaMatcher = MarkdownASTToDeltaExtension({
  name: 'link',
  match: ast => ast.type === 'link',
  toDelta: (ast, context) => {
    if (!('children' in ast) || !('url' in ast)) {
      return [];
    }
    const { configs } = context;
    const baseUrl = configs.get('docLinkBaseUrl') ?? '';
    if (baseUrl && ast.url.startsWith(baseUrl)) {
      const path = ast.url.substring(baseUrl.length);
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
      context.toDelta(child).map(delta => {
        delta.attributes = { ...delta.attributes, link: ast.url };
        return delta;
      })
    );
  },
});
