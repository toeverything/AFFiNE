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

/**
 * Converts inline footnote syntax `^[text]` to reference-style footnotes
 * per FR-034a.
 *
 * `^[text]` → auto-generated `[^fn-N]` reference with `[^fn-N]: text`
 * definition appended at end of document.
 *
 * @example
 * "Hello^[World]" → "Hello[^fn-1]\n\n[^fn-1]: World"
 */
export function preprocessInlineFootnotes(content: string): string {
  const definitions: string[] = [];
  let counter = 1;

  const result = content.replace(
    /(?<!\\)\^\[([^\]]+)\]/g,
    (_, text: string) => {
      const label = `fn-${counter++}`;
      definitions.push(`[^${label}]: ${text}`);
      return `[^${label}]`;
    }
  );

  if (definitions.length === 0) {
    return result;
  }

  return result + '\n\n' + definitions.join('\n');
}

const inlineFootnotePreprocessor: MarkdownAdapterPreprocessor = {
  name: 'inline-footnote',
  levels: ['block', 'slice', 'doc'],
  preprocess: preprocessInlineFootnotes,
};

export const InlineFootnoteMarkdownPreprocessorExtension =
  MarkdownPreprocessorExtension(inlineFootnotePreprocessor);
