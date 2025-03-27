import { LatexExtension } from '@blocksuite/affine-inline-latex';
import { LinkExtension } from '@blocksuite/affine-inline-link';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { InlineMarkdownExtension } from '@blocksuite/block-std/inline';
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
    pattern: /.*\*{3}([^\s*][^*]*[^\s*])\*{3}$|.*\*{3}([^\s*])\*{3}$/,
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
      const annotatedText = match[0].slice(-targetText.length - 3 * 2);
      const startIndex = inlineRange.index - annotatedText.length;

      inlineEditor.insertText(
        {
          index: startIndex + annotatedText.length,
          length: 0,
        },
        ' '
      );
      inlineEditor.setInlineRange({
        index: startIndex + annotatedText.length + 1,
        length: 0,
      });

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
        index: startIndex + annotatedText.length,
        length: 1,
      });
      inlineEditor.deleteText({
        index: startIndex + annotatedText.length - 3,
        length: 3,
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
  pattern: /.*\*{2}([^\s][^*]*[^\s*])\*{2}$|.*\*{2}([^\s*])\*{2}$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const targetText = match[1] ?? match[2];
    const annotatedText = match[0].slice(-targetText.length - 2 * 2);
    const startIndex = inlineRange.index - annotatedText.length;

    inlineEditor.insertText(
      {
        index: startIndex + annotatedText.length,
        length: 0,
      },
      ' '
    );
    inlineEditor.setInlineRange({
      index: startIndex + annotatedText.length + 1,
      length: 0,
    });

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
      index: startIndex + annotatedText.length,
      length: 1,
    });
    inlineEditor.deleteText({
      index: startIndex + annotatedText.length - 2,
      length: 2,
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
  pattern: /.*\*{1}([^\s][^*]*[^\s*])\*{1}$|.*\*{1}([^\s*])\*{1}$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const targetText = match[1] ?? match[2];
    const annotatedText = match[0].slice(-targetText.length - 1 * 2);
    const startIndex = inlineRange.index - annotatedText.length;

    inlineEditor.insertText(
      {
        index: startIndex + annotatedText.length,
        length: 0,
      },
      ' '
    );
    inlineEditor.setInlineRange({
      index: startIndex + annotatedText.length + 1,
      length: 0,
    });

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
      index: startIndex + annotatedText.length,
      length: 1,
    });
    inlineEditor.deleteText({
      index: startIndex + annotatedText.length - 1,
      length: 1,
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
    pattern: /.*~{2}([^\s][^~]*[^\s])~{2}$|.*~{2}([^\s~])~{2}$/,
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
      const annotatedText = match[0].slice(-targetText.length - 2 * 2);
      const startIndex = inlineRange.index - annotatedText.length;

      inlineEditor.insertText(
        {
          index: startIndex + annotatedText.length,
          length: 0,
        },
        ' '
      );
      inlineEditor.setInlineRange({
        index: startIndex + annotatedText.length + 1,
        length: 0,
      });

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
        index: startIndex + annotatedText.length,
        length: 1,
      });
      inlineEditor.deleteText({
        index: startIndex + annotatedText.length - 2,
        length: 2,
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
    pattern: /.*~{1}([^\s][^~]*[^\s~])~{1}$|.*~{1}([^\s~])~{1}$/,
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
      const annotatedText = match[0].slice(-targetText.length - 1 * 2);
      const startIndex = inlineRange.index - annotatedText.length;

      inlineEditor.insertText(
        {
          index: startIndex + annotatedText.length,
          length: 0,
        },
        ' '
      );
      inlineEditor.setInlineRange({
        index: startIndex + annotatedText.length + 1,
        length: 0,
      });

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
        index: startIndex + annotatedText.length,
        length: 1,
      });
      inlineEditor.deleteText({
        index: inlineRange.index - 1,
        length: 1,
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
  pattern: /.*`([^\s][^`]*[^\s])`$|.*`([^\s`])`$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const targetText = match[1] ?? match[2];
    const annotatedText = match[0].slice(-targetText.length - 1 * 2);
    const startIndex = inlineRange.index - annotatedText.length;

    inlineEditor.insertText(
      {
        index: startIndex + annotatedText.length,
        length: 0,
      },
      ' '
    );
    inlineEditor.setInlineRange({
      index: startIndex + annotatedText.length + 1,
      length: 0,
    });

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
      index: startIndex + annotatedText.length,
      length: 1,
    });
    inlineEditor.deleteText({
      index: startIndex + annotatedText.length - 1,
      length: 1,
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

export const MarkdownExtensions: ExtensionType[] = [
  BoldItalicMarkdown,
  BoldMarkdown,
  ItalicExtension,
  StrikethroughExtension,
  UnderthroughExtension,
  CodeExtension,
  LinkExtension,
  LatexExtension,
];
