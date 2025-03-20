import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type { BlockComponent } from '@blocksuite/block-std';
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

export const LinkExtension = InlineMarkdownExtension<AffineTextAttributes>({
  name: 'link',
  pattern: /.*\[(.+?)\]\((.+?)\)$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const linkText = match[1];
    const linkUrl = match[2];
    const annotatedText = match[0].slice(-linkText.length - linkUrl.length - 4);
    const startIndex = inlineRange.index - annotatedText.length;

    inlineEditor.insertText(
      {
        index: inlineRange.index,
        length: 0,
      },
      ' '
    );
    inlineEditor.setInlineRange({
      index: inlineRange.index + 1,
      length: 0,
    });

    undoManager.stopCapturing();

    // aaa[bbb](baidu.com) + space

    // delete (baidu.com) + space
    inlineEditor.deleteText({
      index: startIndex + 1 + linkText.length + 1,
      length: 1 + linkUrl.length + 1 + 1,
    });
    // delete [ and ]
    inlineEditor.deleteText({
      index: startIndex + 1 + linkText.length,
      length: 1,
    });
    inlineEditor.deleteText({
      index: startIndex,
      length: 1,
    });

    inlineEditor.formatText(
      {
        index: startIndex,
        length: linkText.length,
      },
      {
        link: linkUrl,
      }
    );

    inlineEditor.setInlineRange({
      index: startIndex + linkText.length,
      length: 0,
    });
  },
});

export const LatexExtension = InlineMarkdownExtension<AffineTextAttributes>({
  name: 'latex',

  pattern:
    /(?:\$\$)(?<content>[^$]+)(?:\$\$)$|(?<blockPrefix>\$\$\$\$)|(?<inlinePrefix>\$\$)$/g,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = pattern.exec(prefixText);
    if (!match || !match.groups) return;
    const content = match.groups['content'];
    const inlinePrefix = match.groups['inlinePrefix'];
    const blockPrefix = match.groups['blockPrefix'];

    if (blockPrefix === '$$$$') {
      inlineEditor.insertText(
        {
          index: inlineRange.index,
          length: 0,
        },
        ' '
      );
      inlineEditor.setInlineRange({
        index: inlineRange.index + 1,
        length: 0,
      });

      undoManager.stopCapturing();

      if (!inlineEditor.rootElement) return;
      const blockComponent =
        inlineEditor.rootElement.closest<BlockComponent>('[data-block-id]');
      if (!blockComponent) return;

      const doc = blockComponent.doc;
      const parentComponent = blockComponent.parentComponent;
      if (!parentComponent) return;

      const index = parentComponent.model.children.indexOf(
        blockComponent.model
      );
      if (index === -1) return;

      inlineEditor.deleteText({
        index: inlineRange.index - 4,
        length: 5,
      });

      const id = doc.addBlock(
        'affine:latex',
        {
          latex: '',
        },
        parentComponent.model,
        index + 1
      );
      blockComponent.host.updateComplete
        .then(() => {
          const latexBlock = blockComponent.std.view.getBlock(id);
          if (!latexBlock || latexBlock.flavour !== 'affine:latex') return;

          //FIXME(@Flrande): wait for refactor
          // @ts-expect-error BS-2241
          latexBlock.toggleEditor();
        })
        .catch(console.error);

      return;
    }

    if (inlinePrefix === '$$') {
      inlineEditor.insertText(
        {
          index: inlineRange.index,
          length: 0,
        },
        ' '
      );
      inlineEditor.setInlineRange({
        index: inlineRange.index + 1,
        length: 0,
      });

      undoManager.stopCapturing();

      inlineEditor.deleteText({
        index: inlineRange.index - 2,
        length: 3,
      });
      inlineEditor.insertText(
        {
          index: inlineRange.index - 2,
          length: 0,
        },
        ' '
      );
      inlineEditor.formatText(
        {
          index: inlineRange.index - 2,
          length: 1,
        },
        {
          latex: '',
        }
      );

      inlineEditor
        .waitForUpdate()
        .then(async () => {
          await inlineEditor.waitForUpdate();

          const textPoint = inlineEditor.getTextPoint(
            inlineRange.index - 2 + 1
          );
          if (!textPoint) return;

          const [text] = textPoint;
          const latexNode = text.parentElement?.closest('affine-latex-node');
          if (!latexNode) return;

          latexNode.toggleEditor();
        })
        .catch(console.error);

      return;
    }

    if (!content || content.length === 0) return;

    inlineEditor.insertText(
      {
        index: inlineRange.index,
        length: 0,
      },
      ' '
    );
    inlineEditor.setInlineRange({
      index: inlineRange.index + 1,
      length: 0,
    });

    undoManager.stopCapturing();

    const startIndex = inlineRange.index - 2 - content.length - 2;
    inlineEditor.deleteText({
      index: startIndex,
      length: 2 + content.length + 2 + 1,
    });
    inlineEditor.insertText(
      {
        index: startIndex,
        length: 0,
      },
      ' '
    );
    inlineEditor.formatText(
      {
        index: startIndex,
        length: 1,
      },
      {
        latex: String.raw`${content}`,
      }
    );

    inlineEditor.setInlineRange({
      index: startIndex + 1,
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
