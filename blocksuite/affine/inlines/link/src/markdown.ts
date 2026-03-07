import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { isValidUrl, normalizeUrl } from '@blocksuite/affine-shared/utils';
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

/**
 * Bare URL autolink: typing `https://example.com ` or `https://example.com` + Enter
 * auto-converts the URL to a clickable link delta per FR-010.
 *
 * Matches http(s)/ftp(s)/www. URLs (same schemes as isValidUrl).
 * The pattern ends with `\s$` so it fires on Space; Enter is handled by the
 * rich-text markdown transform loop which synthetically adds a trailing space.
 */
export const UrlAutolinkExtension =
  InlineMarkdownExtension<AffineTextAttributes>({
    name: 'url-autolink',
    pattern: /(?:^|\s)((?:https?:\/\/|ftp:\/\/|sftp:\/\/|www\.)\S+)\s$/,
    action: ({
      inlineEditor,
      prefixText,
      inlineRange,
      pattern,
      undoManager,
    }) => {
      const match = prefixText.match(pattern);
      if (!match) return;

      const rawUrl = match[1];
      const normalised = normalizeUrl(rawUrl);
      if (!normalised || !isValidUrl(rawUrl)) return;

      // The URL token ends at inlineRange.index - 1 (before the trailing space).
      const urlEnd = inlineRange.index - 1;
      const urlStart = urlEnd - rawUrl.length;

      undoManager.stopCapturing();

      inlineEditor.formatText(
        { index: urlStart, length: rawUrl.length },
        { link: normalised }
      );

      inlineEditor.setInlineRange({ index: inlineRange.index, length: 0 });
    },
  });

/**
 * Email autolink: typing `user@example.com ` auto-converts to a `mailto:` link per FR-010.
 *
 * Matches a simple email token (local@domain.tld) not already preceded by a
 * URL scheme so it doesn't collide with the URL autolink above.
 */
export const EmailAutolinkExtension =
  InlineMarkdownExtension<AffineTextAttributes>({
    name: 'email-autolink',
    pattern: /(?:^|\s)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s$/,
    action: ({
      inlineEditor,
      prefixText,
      inlineRange,
      pattern,
      undoManager,
    }) => {
      const match = prefixText.match(pattern);
      if (!match) return;

      const email = match[1];
      const mailtoUrl = `mailto:${email}`;

      const emailEnd = inlineRange.index - 1;
      const emailStart = emailEnd - email.length;

      undoManager.stopCapturing();

      inlineEditor.formatText(
        { index: emailStart, length: email.length },
        { link: mailtoUrl }
      );

      inlineEditor.setInlineRange({ index: inlineRange.index, length: 0 });
    },
  });
