import { LatexExtension } from '@blocksuite/affine-inline-latex';
import {
  EmailAutolinkExtension,
  LinkExtension,
  UrlAutolinkExtension,
} from '@blocksuite/affine-inline-link';
import { isValidTagName } from '@blocksuite/affine-inline-tag';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { InlineMarkdownExtension } from '@blocksuite/std/inline';
import type { ExtensionType } from '@blocksuite/store';

// inline markdown match rules:
// covert: ***test*** + space
// covert: ***t est*** + space
// not convert: *** test*** + space
// not convert: ***test *** + space
// not convert: *** test *** + space

export const BoldItalicMarkdown = InlineMarkdownExtension<AffineTextAttributes>(
  {
    name: 'bolditalic',
    pattern: /.*\*{3}([^\s*][^*]*[^\s*])\*{3}\s$|.*\*{3}([^\s*])\*{3}\s$/,
    action: ({
      inlineEditor,
      prefixText,
      inlineRange,
      pattern,
      undoManager,
    }) => {
      const match = prefixText.match(pattern);
      if (!match) return;

      const targetText = match[1] ?? match[2];
      const annotatedText = match[0].slice(
        -(targetText.length + 3 * 2 + 1),
        -1
      );
      const startIndex = inlineRange.index - annotatedText.length - 1;

      undoManager.stopCapturing();

      inlineEditor.formatText(
        {
          index: startIndex,
          length: annotatedText.length,
        },
        {
          bold: true,
          italic: true,
        }
      );

      inlineEditor.deleteText({
        index: inlineRange.index - 4,
        length: 4,
      });
      inlineEditor.deleteText({
        index: startIndex,
        length: 3,
      });
      inlineEditor.setInlineRange({
        index: startIndex + annotatedText.length - 6,
        length: 0,
      });
    },
  }
);

export const BoldMarkdown = InlineMarkdownExtension<AffineTextAttributes>({
  name: 'bold',
  pattern: /.*\*{2}([^\s][^*]*[^\s*])\*{2}\s$|.*\*{2}([^\s*])\*{2}\s$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const targetText = match[1] ?? match[2];
    const annotatedText = match[0].slice(-(targetText.length + 2 * 2 + 1), -1);
    const startIndex = inlineRange.index - annotatedText.length - 1;

    undoManager.stopCapturing();

    inlineEditor.formatText(
      {
        index: startIndex,
        length: annotatedText.length,
      },
      {
        bold: true,
      }
    );

    inlineEditor.deleteText({
      index: inlineRange.index - 3,
      length: 3,
    });
    inlineEditor.deleteText({
      index: startIndex,
      length: 2,
    });
    inlineEditor.setInlineRange({
      index: startIndex + annotatedText.length - 4,
      length: 0,
    });
  },
});

export const ItalicExtension = InlineMarkdownExtension<AffineTextAttributes>({
  name: 'italic',
  pattern: /.*\*{1}([^\s][^*]*[^\s*])\*{1}\s$|.*\*{1}([^\s*])\*{1}\s$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const targetText = match[1] ?? match[2];
    const annotatedText = match[0].slice(-(targetText.length + 1 * 2 + 1), -1);
    const startIndex = inlineRange.index - annotatedText.length - 1;

    undoManager.stopCapturing();

    inlineEditor.formatText(
      {
        index: startIndex,
        length: annotatedText.length,
      },
      {
        italic: true,
      }
    );

    inlineEditor.deleteText({
      index: inlineRange.index - 2,
      length: 2,
    });
    inlineEditor.deleteText({
      index: startIndex,
      length: 1,
    });
    inlineEditor.setInlineRange({
      index: startIndex + annotatedText.length - 2,
      length: 0,
    });
  },
});

export const StrikethroughExtension =
  InlineMarkdownExtension<AffineTextAttributes>({
    name: 'strikethrough',
    pattern: /.*~{2}([^\s][^~]*[^\s])~{2}\s$|.*~{2}([^\s~])~{2}\s$/,
    action: ({
      inlineEditor,
      prefixText,
      inlineRange,
      pattern,
      undoManager,
    }) => {
      const match = prefixText.match(pattern);
      if (!match) return;

      const targetText = match[1] ?? match[2];
      const annotatedText = match[0].slice(
        -targetText.length - (2 * 2 + 1),
        -1
      );
      const startIndex = inlineRange.index - annotatedText.length - 1;

      undoManager.stopCapturing();

      inlineEditor.formatText(
        {
          index: startIndex,
          length: annotatedText.length,
        },
        {
          strike: true,
        }
      );

      inlineEditor.deleteText({
        index: inlineRange.index - 3,
        length: 3,
      });
      inlineEditor.deleteText({
        index: startIndex,
        length: 2,
      });

      inlineEditor.setInlineRange({
        index: startIndex + annotatedText.length - 4,
        length: 0,
      });
    },
  });

export const UnderthroughExtension =
  InlineMarkdownExtension<AffineTextAttributes>({
    name: 'underthrough',
    pattern: /.*~{1}([^\s][^~]*[^\s~])~{1}\s$|.*~{1}([^\s~])~{1}\s$/,
    action: ({
      inlineEditor,
      prefixText,
      inlineRange,
      pattern,
      undoManager,
    }) => {
      const match = prefixText.match(pattern);
      if (!match) return;

      const targetText = match[1] ?? match[2];
      const annotatedText = match[0].slice(
        -(targetText.length + 1 * 2 + 1),
        -1
      );
      const startIndex = inlineRange.index - annotatedText.length - 1;

      undoManager.stopCapturing();

      inlineEditor.formatText(
        {
          index: startIndex,
          length: annotatedText.length,
        },
        {
          underline: true,
        }
      );

      inlineEditor.deleteText({
        index: inlineRange.index - 2,
        length: 2,
      });
      inlineEditor.deleteText({
        index: startIndex,
        length: 1,
      });

      inlineEditor.setInlineRange({
        index: startIndex + annotatedText.length - 2,
        length: 0,
      });
    },
  });

export const CodeExtension = InlineMarkdownExtension<AffineTextAttributes>({
  name: 'code',
  pattern: /.*`([^\s][^`]*[^\s])`\s$|.*`([^\s`])`\s$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const targetText = match[1] ?? match[2];
    const annotatedText = match[0].slice(-(targetText.length + 1 * 2 + 1), -1);
    const startIndex = inlineRange.index - annotatedText.length - 1;

    undoManager.stopCapturing();

    inlineEditor.formatText(
      {
        index: startIndex,
        length: annotatedText.length,
      },
      {
        code: true,
      }
    );

    inlineEditor.deleteText({
      index: inlineRange.index - 2,
      length: 2,
    });
    inlineEditor.deleteText({
      index: startIndex,
      length: 1,
    });

    inlineEditor.setInlineRange({
      index: startIndex + annotatedText.length - 2,
      length: 0,
    });
  },
});

/**
 * Obsidian ==highlight== inline markdown shortcut.
 *
 * Pattern: ==text== followed by Space (not Enter — consistent with all other extensions).
 * - Leading/trailing spaces inside == == are NOT allowed (same rules as bold/italic).
 * - Nested/adjacent == sequences (e.g. ==a==b==) are NOT supported — treated as ==a== + literal b==
 * - Applies { highlight: 'var(--affine-highlight-yellow)' } and removes delimiters.
 *
 * Per contracts/inline-extensions.md §1.
 */
export const DEFAULT_HIGHLIGHT_COLOR = 'var(--affine-highlight-yellow)';

export const HighlightMarkdown = InlineMarkdownExtension<AffineTextAttributes>({
  name: 'highlight',
  pattern: /.*==([^\s=][^=]*[^\s=])==\s$|.*==([^\s=])==\s$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const targetText = match[1] ?? match[2];
    // annotatedText = ==targetText== (without the trailing space)
    const annotatedText = match[0].slice(-(targetText.length + 2 * 2 + 1), -1);
    const startIndex = inlineRange.index - annotatedText.length - 1;

    undoManager.stopCapturing();

    inlineEditor.formatText(
      {
        index: startIndex,
        length: annotatedText.length,
      },
      {
        highlight: DEFAULT_HIGHLIGHT_COLOR,
      }
    );

    // Delete trailing == + space (3 chars)
    inlineEditor.deleteText({
      index: inlineRange.index - 3,
      length: 3,
    });
    // Delete leading ==
    inlineEditor.deleteText({
      index: startIndex,
      length: 2,
    });

    inlineEditor.setInlineRange({
      index: startIndex + annotatedText.length - 4,
      length: 0,
    });
  },
});

/**
 * Obsidian %% comment %% inline markdown shortcut.
 *
 * Inline form: %%text%% followed by Space.
 * - Applies { obsidianComment: true } to the enclosed text and removes delimiters.
 * - In live preview: renders as zero-width invisible span (aria-hidden="true").
 * - In source mode: renders with visible %% delimiters in grey/muted style.
 *
 * Per contracts/inline-extensions.md §2.
 */
export const CommentMarkdown = InlineMarkdownExtension<AffineTextAttributes>({
  name: 'obsidian-comment',
  pattern: /.*%%([^\s%][^%]*[^\s%])%%\s$|.*%%([^\s%])%%\s$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const targetText = match[1] ?? match[2];
    // annotatedText = %%targetText%% (without the trailing space)
    const annotatedText = match[0].slice(-(targetText.length + 2 * 2 + 1), -1);
    const startIndex = inlineRange.index - annotatedText.length - 1;

    undoManager.stopCapturing();

    inlineEditor.formatText(
      {
        index: startIndex,
        length: annotatedText.length,
      },
      {
        obsidianComment: true,
      }
    );

    // Delete trailing %% + space (3 chars)
    inlineEditor.deleteText({
      index: inlineRange.index - 3,
      length: 3,
    });
    // Delete leading %%
    inlineEditor.deleteText({
      index: startIndex,
      length: 2,
    });

    inlineEditor.setInlineRange({
      index: startIndex + annotatedText.length - 4,
      length: 0,
    });
  },
});

/**
 * Obsidian #tag-name inline markdown shortcut.
 *
 * Pattern: #tag-name followed by Space.
 * - Tag name: [a-zA-Z0-9_\-/]+ with at least one non-digit character.
 * - Leading # at column 0 + space is a heading (handled by block-level rule), not a tag.
 * - Converts the typed `#tag-name ` token into a tag embed delta.
 *
 * Per contracts/inline-extensions.md §4.
 */
const TAG_EMBED_NODE = '\u200B'; // zero-width space used as embed placeholder

/** Exported for unit testing. Matches `#tag-name` followed by a space. */
export const TAG_MARKDOWN_PATTERN =
  /(?:^|.*\s|.*[^\s])#([a-zA-Z0-9_\-/]*[a-zA-Z_\-/][a-zA-Z0-9_\-/]*)\s$/;

export const TagMarkdownExtension =
  InlineMarkdownExtension<AffineTextAttributes>({
    name: 'tag',
    // Match #tag-name (with optional prefix text) followed by a trailing space.
    // Disallow # immediately followed by a space (that's a heading trigger).
    pattern: TAG_MARKDOWN_PATTERN,
    action: ({
      inlineEditor,
      prefixText,
      inlineRange,
      pattern,
      undoManager,
    }) => {
      const match = prefixText.match(pattern);
      if (!match) return;

      const rawName = match[1];
      if (!isValidTagName(rawName)) return;

      const canonical = rawName.toLowerCase();
      const tokenLength = rawName.length + 1; // # + name
      // The trailing space is at inlineRange.index - 1; the token ends before it.
      const tokenEnd = inlineRange.index - 1;
      const tokenStart = tokenEnd - tokenLength;

      undoManager.stopCapturing();

      // Delete the typed #tag-name characters.
      inlineEditor.deleteText({ index: tokenStart, length: tokenLength });

      // Insert a zero-width embed node with the tag attribute.
      inlineEditor.insertText(
        { index: tokenStart, length: 0 },
        TAG_EMBED_NODE,
        {
          tag: { name: canonical },
        } as AffineTextAttributes
      );

      inlineEditor.setInlineRange({ index: tokenStart + 1, length: 0 });
    },
  });

export const MarkdownExtensions: ExtensionType[] = [
  BoldItalicMarkdown,
  BoldMarkdown,
  ItalicExtension,
  StrikethroughExtension,
  UnderthroughExtension,
  CodeExtension,
  LatexExtension,
  HighlightMarkdown,
  CommentMarkdown,
  TagMarkdownExtension,
  LinkExtension,
  UrlAutolinkExtension,
  EmailAutolinkExtension,
];
