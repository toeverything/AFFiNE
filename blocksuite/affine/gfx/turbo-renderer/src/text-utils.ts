import type { TextRect } from './types';

interface WordSegment {
  text: string;
  start: number;
  end: number;
}

const CJK_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/u;

const sentenceSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'sentence',
});
const wordSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'word',
});
const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

function hasCJK(text: string): boolean {
  return CJK_REGEX.test(text);
}

function getWordSegments(text: string): WordSegment[] {
  const segmenter = hasCJK(text) ? graphemeSegmenter : wordSegmenter;
  return Array.from(segmenter.segment(text)).map(({ segment, index }) => ({
    text: segment,
    start: index,
    end: index + segment.length,
  }));
}

function getRangeRects(range: Range, fullText: string): TextRect[] {
  const rects = Array.from(range.getClientRects());
  const textRects: TextRect[] = [];

  if (rects.length === 0) return textRects;

  // If there's only one rect, use the full text
  if (rects.length === 1) {
    const rect = rects[0];
    textRects.push({
      rect: {
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
      },
      text: fullText,
    });
    return textRects;
  }

  const segments = getWordSegments(fullText);

  // Calculate the total width and average width per character
  const totalWidth = Math.floor(
    rects.reduce((sum, rect) => sum + rect.width, 0)
  );
  const charWidthEstimate = totalWidth / fullText.length;

  let currentRect = 0;
  let currentSegments: WordSegment[] = [];
  let currentWidth = 0;

  segments.forEach(segment => {
    const segmentWidth = segment.text.length * charWidthEstimate;
    if (
      currentWidth + segmentWidth > rects[currentRect]?.width &&
      currentSegments.length > 0
    ) {
      const rect = rects[currentRect];
      textRects.push({
        rect: {
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
        },
        text: currentSegments.map(seg => seg.text).join(''),
      });

      currentRect++;
      currentSegments = [segment];
      currentWidth = segmentWidth;
    } else {
      currentSegments.push(segment);
      currentWidth += segmentWidth;
    }
  });

  // Handle remaining segments if any
  if (currentSegments.length > 0) {
    const rect = rects[Math.min(currentRect, rects.length - 1)];
    textRects.push({
      rect: {
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
      },
      text: currentSegments.map(seg => seg.text).join(''),
    });
  }

  return textRects;
}

export function getSentenceRects(
  element: Element,
  sentence: string
): TextRect[] {
  const textNode = Array.from(element.childNodes).find(
    node => node.nodeType === Node.TEXT_NODE
  );

  if (!textNode) return [];

  const text = textNode.textContent || '';
  let rects: TextRect[] = [];
  let startIndex = 0;

  // Find all occurrences of the sentence and ensure we capture complete words
  while ((startIndex = text.indexOf(sentence, startIndex)) !== -1) {
    const range = document.createRange();
    let endIndex = startIndex + sentence.length;

    range.setStart(textNode, startIndex);
    range.setEnd(textNode, endIndex);

    rects = rects.concat(
      getRangeRects(range, text.slice(startIndex, endIndex))
    );
    startIndex = endIndex;
  }

  return rects;
}

export function segmentSentences(text: string): string[] {
  return Array.from(sentenceSegmenter.segment(text)).map(
    ({ segment }) => segment
  );
}
