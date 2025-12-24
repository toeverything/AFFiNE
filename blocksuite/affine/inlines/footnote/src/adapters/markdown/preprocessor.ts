import {
  type MarkdownAdapterPreprocessor,
  MarkdownPreprocessorExtension,
} from '@blocksuite/affine-shared/adapters';

/**
 * Check if a string is a URL
 * @param str
 * @returns
 */
function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Preprocess footnote references to avoid markdown link parsing
 * Only add space when footnote reference follows a URL
 * @param content
 * @returns
 * @example
 * ```md
 * https://example.com[^label] -> https://example.com [^label]
 * normal text[^label] -> normal text[^label]
 * ```
 */
export function preprocessFootnoteReference(content: string) {
  return content.replace(
    /([^\s]+?)(\[\^[^\]]+\])(?!:)/g,
    (match, prevText, footnoteRef) => {
      // Only add space if the previous text is a URL
      if (isUrl(prevText)) {
        return prevText + ' ' + footnoteRef;
      }
      // Otherwise return the original match
      return match;
    }
  );
}

const footnoteReferencePreprocessor: MarkdownAdapterPreprocessor = {
  name: 'footnote-reference',
  levels: ['block', 'slice', 'doc'],
  preprocess: content => {
    return preprocessFootnoteReference(content);
  },
};

export const FootnoteReferenceMarkdownPreprocessorExtension =
  MarkdownPreprocessorExtension(footnoteReferencePreprocessor);
