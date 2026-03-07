import {
  type MarkdownAdapterPreprocessor,
  MarkdownPreprocessorExtension,
} from '@blocksuite/affine-shared/adapters';

/**
 * Wikilink markdown preprocessor.
 *
 * Converts Obsidian wikilink syntax `[[title]]`, `[[title|alias]]`,
 * `[[title#anchor]]`, `[[title#^block-id]]` to a temporary link format
 * `[displayText](affine-wikilink:title)` before remark parsing.
 *
 * The `affine-wikilink:` scheme is then recognised by the markdown
 * delta converter to produce a reference inline delta with `pageId: ''`.
 *
 * Per contracts/inline-extensions.md §3, paste-path universality assumption.
 */
export function preprocessWikilinks(content: string): string {
  return content.replace(/\[\[([^[\]\n]+?)\]\]/g, (_, rawContent: string) => {
    const pipeIdx = rawContent.indexOf('|');
    const hashIdx =
      pipeIdx !== -1
        ? rawContent.slice(0, pipeIdx).indexOf('#')
        : rawContent.indexOf('#');

    let titlePart: string;
    let displayText: string;

    if (pipeIdx !== -1) {
      titlePart = rawContent.slice(0, pipeIdx);
      displayText = rawContent.slice(pipeIdx + 1).trim();
    } else {
      titlePart = rawContent;
      displayText = rawContent;
    }

    let targetTitle: string;
    let anchor = '';
    if (hashIdx !== -1) {
      targetTitle = titlePart.slice(0, hashIdx);
      anchor = titlePart.slice(hashIdx + 1);
      if (pipeIdx === -1) {
        displayText = targetTitle;
      }
    } else {
      targetTitle = titlePart;
    }

    targetTitle = targetTitle.trim();
    if (!targetTitle) return _; // skip malformed wikilinks

    // Encode as affine-wikilink URL: affine-wikilink:<title>#<anchor>
    const encodedTitle = encodeURIComponent(targetTitle);
    const anchorPart = anchor ? `#${encodeURIComponent(anchor)}` : '';
    const url = `affine-wikilink:${encodedTitle}${anchorPart}`;

    return `[${displayText.trim() || targetTitle}](${url})`;
  });
}

export const WikilinkMarkdownPreprocessorExtension =
  MarkdownPreprocessorExtension({
    name: 'wikilink',
    preprocess: preprocessWikilinks,
  } as MarkdownAdapterPreprocessor);
