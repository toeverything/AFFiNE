import type { MarkdownAST } from '@blocksuite/affine-shared/adapters';
import { MarkdownASTToDeltaExtension } from '@blocksuite/affine-shared/adapters';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';

/**
 * Markdown AST → delta converter for wikilinks.
 *
 * The WikilinkMarkdownPreprocessorExtension converts [[title]] to
 * [displayText](affine-wikilink:encodedTitle#encodedAnchor) before remark parsing.
 * This matcher detects those links by the `affine-wikilink:` URL scheme and
 * converts them to unresolved reference inline deltas (pageId = '').
 *
 * Per contracts/inline-extensions.md §3, paste-path universality assumption.
 */
export const wikilinkMarkdownASTToDeltaMatcher = MarkdownASTToDeltaExtension({
  name: 'wikilink',
  match: (node: MarkdownAST) => {
    return (
      node.type === 'link' &&
      'url' in node &&
      typeof (node as { url: string }).url === 'string' &&
      (node as { url: string }).url.startsWith('affine-wikilink:')
    );
  },
  toDelta: (node: MarkdownAST) => {
    if (node.type !== 'link') return [];
    const linkNode = node as {
      url: string;
      children: Array<{ type: string; value: string }>;
    };

    const url = linkNode.url;
    // Parse affine-wikilink:encodedTitle[#encodedAnchor]
    const withoutScheme = url.slice('affine-wikilink:'.length);
    const hashIdx = withoutScheme.indexOf('#');
    let encodedTitle: string;
    let encodedAnchor: string | undefined;
    if (hashIdx !== -1) {
      encodedTitle = withoutScheme.slice(0, hashIdx);
      encodedAnchor = withoutScheme.slice(hashIdx + 1);
    } else {
      encodedTitle = withoutScheme;
    }

    const targetTitle = decodeURIComponent(encodedTitle);
    const anchor = encodedAnchor
      ? decodeURIComponent(encodedAnchor)
      : undefined;

    const refParams: { blockIds?: string[] } = {};
    if (anchor?.startsWith('^')) {
      refParams.blockIds = [anchor.slice(1)];
    }
    const hasParams = Object.keys(refParams).length > 0;

    return [
      {
        insert: REFERENCE_NODE,
        attributes: {
          reference: {
            type: 'LinkedPage' as const,
            pageId: '', // unresolved
            title: targetTitle,
            params: hasParams ? refParams : undefined,
          },
        },
      },
    ];
  },
});
