import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { InlineMarkdownExtension } from '@blocksuite/std/inline';

export const LinkExtension = InlineMarkdownExtension<AffineTextAttributes>({
  name: 'link',
  pattern: /.*\[(.+?)\]\((.+?)\)\s$/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;

    const linkText = match[1];
    const linkUrl = match[2];
    const annotatedText = match[0].slice(
      -(linkText.length + linkUrl.length + 4 + 1),
      -1
    );
    const startIndex = inlineRange.index - annotatedText.length - 1;

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
