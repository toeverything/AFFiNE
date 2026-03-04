import type {
  AffineInlineEditor,
  AffineTextAttributes,
} from '@blocksuite/affine-shared/types';
import {
  splitTextByUrl,
  type UrlTextSegment,
} from '@blocksuite/affine-shared/utils';
import type { InlineRange } from '@blocksuite/std/inline';

type UrlPasteInlineEditor = Pick<
  AffineInlineEditor,
  'insertText' | 'setInlineRange'
>;

export function analyzeTextForUrlPaste(text: string) {
  const segments = splitTextByUrl(text);
  const firstSegment = segments[0];
  const singleUrl =
    segments.length === 1 && firstSegment?.link && firstSegment.text === text
      ? firstSegment.link
      : undefined;
  return {
    segments,
    singleUrl,
  };
}

export function insertUrlTextSegments(
  inlineEditor: UrlPasteInlineEditor,
  inlineRange: InlineRange,
  segments: UrlTextSegment[]
) {
  let index = inlineRange.index;
  let replacedSelection = false;
  segments.forEach(segment => {
    if (!segment.text) return;
    const attributes: AffineTextAttributes | undefined = segment.link
      ? { link: segment.link }
      : undefined;
    inlineEditor.insertText(
      {
        index,
        length: replacedSelection ? 0 : inlineRange.length,
      },
      segment.text,
      attributes
    );
    replacedSelection = true;
    index += segment.text.length;
  });
  inlineEditor.setInlineRange({
    index,
    length: 0,
  });
}
