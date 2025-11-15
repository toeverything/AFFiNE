import { TextUtils } from '@blocksuite/affine-block-surface';
import type {
  FontFamily,
  FontStyle,
  FontWeight,
  TextElementModel,
} from '@blocksuite/affine-model';
import type { Bound } from '@blocksuite/global/gfx';
import {
  getPointsFromBoundWithRotation,
  rotatePoints,
} from '@blocksuite/global/gfx';
import { deltaInsertsToChunks } from '@blocksuite/std/inline';
import type * as Y from 'yjs';

const { getFontFacesByFontFamily, wrapFontFamily } = TextUtils;

export type TextDelta = {
  insert: string;
  attributes?: Record<string, unknown>;
};

const getMeasureCtx = (function initMeasureContext() {
  let ctx: CanvasRenderingContext2D | null = null;
  let canvas: HTMLCanvasElement | null = null;

  return () => {
    if (!canvas) {
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d')!;
    }

    return ctx!;
  };
})();

const textMeasureCache = new Map<
  string,
  {
    lineHeight: number;
    lineGap: number;
    fontSize: number;
  }
>();

export function measureTextInDOM(
  fontFamily: string,
  fontSize: number,
  fontWeight: string
) {
  const cacheKey = `${wrapFontFamily(fontFamily)}-${fontWeight}`;

  if (textMeasureCache.has(cacheKey)) {
    const {
      fontSize: cacheFontSize,
      lineGap,
      lineHeight,
    } = textMeasureCache.get(cacheKey)!;

    return {
      lineHeight: lineHeight * (fontSize / cacheFontSize),
      lineGap: lineGap * (fontSize / cacheFontSize),
    };
  }

  const div = document.createElement('div');
  const span = document.createElement('span');

  div.append(span);

  span.innerText = 'x';

  div.style.position = 'absolute';
  div.style.top = '0px';
  div.style.left = '0px';
  div.style.visibility = 'hidden';
  div.style.fontFamily = wrapFontFamily(fontFamily);
  div.style.fontWeight = fontWeight;
  div.style.fontSize = `${fontSize}px`;

  div.style.pointerEvents = 'none';

  document.body.append(div);

  const lineHeight = span.getBoundingClientRect().height;
  const height = div.getBoundingClientRect().height;
  const result = {
    lineHeight,
    lineGap: height - lineHeight,
  };

  div.remove();

  textMeasureCache.set(cacheKey, {
    ...result,
    fontSize,
  });

  return result;
}

export function getFontString({
  fontStyle,
  fontWeight,
  fontSize,
  fontFamily,
}: {
  fontStyle: string;
  fontWeight: string;
  fontSize: number;
  fontFamily: string;
}): string {
  const lineHeight = getLineHeight(fontFamily, fontSize, fontWeight);
  return `${fontStyle} ${fontWeight} ${fontSize}px/${lineHeight}px ${wrapFontFamily(
    fontFamily
  )}, sans-serif`.trim();
}

export function getLineHeight(
  fontFamily: string,
  fontSize: number,
  fontWeight: string
): number {
  const { lineHeight } = measureTextInDOM(fontFamily, fontSize, fontWeight);
  return lineHeight;
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

type TextMetricsLike = Writeable<TextMetrics>;

const metricsCache = new Map<
  string,
  {
    fontSize: number;
    metrics: TextMetrics;
  }
>();
export function getFontMetrics(
  fontFamily: string,
  fontSize: number,
  fontWeight: string
) {
  const ctx = getMeasureCtx();
  const cacheKey = `${wrapFontFamily(fontFamily)}-${fontWeight}`;

  if (metricsCache.has(cacheKey)) {
    const { fontSize: cacheFontSize, metrics } = metricsCache.get(cacheKey)!;

    return Object.keys(Object.getPrototypeOf(metrics)).reduce((acc, key) => {
      acc[key as keyof TextMetrics] =
        metrics[key as keyof TextMetrics] * (fontSize / cacheFontSize);
      return acc;
    }, {} as TextMetricsLike);
  }

  const font = `${fontWeight} ${fontSize}px ${wrapFontFamily(fontFamily)}`;
  ctx.font = font;
  const metrics = ctx.measureText('x');

  // check if font does not fallback
  if (ctx.font === font) {
    metricsCache.set(cacheKey, {
      fontSize,
      metrics,
    });
  }

  return metrics;
}

const RS_LTR_CHARS =
  'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF' +
  '\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF';
const RS_RTL_CHARS = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC';
// eslint-disable-next-line no-misleading-character-class
const RE_RTL_CHECK = new RegExp(`^[^${RS_LTR_CHARS}]*[${RS_RTL_CHARS}]`);
export function isRTL(text: string) {
  return RE_RTL_CHECK.test(text);
}

export function splitIntoLines(text: string): string[] {
  return normalizeText(text).split('\n');
}

export function getLineWidth(text: string, font: string): number {
  const ctx = getMeasureCtx();
  if (font !== ctx.font) ctx.font = font;
  const width = ctx.measureText(text).width;

  return width;
}

export function getTextWidth(text: string, font: string): number {
  const lines = splitIntoLines(text);
  let width = 0;
  lines.forEach(line => {
    width = Math.max(width, getLineWidth(line, font));
  });
  return width;
}

export function wrapTextDeltas(text: Y.Text, font: string, w: number) {
  if (!text) return [];

  const deltas: TextDelta[] = (text.toDelta() as TextDelta[]).flatMap(
    delta => ({
      insert: wrapText(delta.insert, font, w),
      attributes: delta.attributes,
    })
  ) as TextDelta[];

  return deltas;
}

export const truncateTextByWidth = (
  text: string,
  font: string,
  width: number
) => {
  let totalWidth = 0;
  let i = 0;
  for (; i < text.length; i++) {
    const char = text[i];
    totalWidth += charWidth.calculate(char, font);
    if (totalWidth > width) {
      break;
    }
  }
  return text.slice(0, i);
};

export function getTextCursorPosition(
  model: TextElementModel,
  coord: { x: number; y: number }
) {
  const leftTop = getPointsFromBoundWithRotation(model)[0];
  const mousePos = rotatePoints(
    [[coord.x, coord.y]],
    leftTop,
    -model.rotate
  )[0];

  return [
    Math.floor(
      (mousePos[1] - leftTop[1]) /
        getLineHeight(model.fontFamily, model.fontSize, model.fontWeight)
    ),
    mousePos[0] - leftTop[0],
  ];
}

export function getCursorByCoord(
  model: TextElementModel,
  coord: { x: number; y: number }
) {
  const [lineIndex, offsetX] = getTextCursorPosition(model, coord);

  const font = getFontString(model);
  const deltas = wrapTextDeltas(model.text, font, model.w);
  const lines = deltaInsertsToChunks(deltas).map(line =>
    line.map(iTextDelta => iTextDelta.insert).join('')
  );

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return model.text.length;
  }

  const string = lines[lineIndex];

  let index = lines.slice(0, lineIndex).join('').length - 1;
  let currentStringWidth = 0;
  let charIndex = 0;
  while (currentStringWidth < offsetX) {
    index += 1;
    if (charIndex === string.length) {
      break;
    }
    currentStringWidth += charWidth.calculate(string[charIndex], font);
    charIndex += 1;
  }
  return index;
}

export function normalizeTextBound(
  {
    yText,
    fontStyle,
    fontWeight,
    fontSize,
    fontFamily,
    hasMaxWidth,
    maxWidth,
  }: {
    yText: Y.Text;
    fontStyle: FontStyle;
    fontWeight: FontWeight;
    fontSize: number;
    fontFamily: FontFamily;
    hasMaxWidth?: boolean;
    maxWidth?: number;
  },
  bound: Bound,
  dragging: boolean = false
): Bound {
  if (!yText) return bound;

  const lineHeightPx = getLineHeight(fontFamily, fontSize, fontWeight);
  const font = getFontString({
    fontStyle,
    fontWeight,
    fontSize,
    fontFamily,
  });

  let lines: TextDelta[][] = [];
  const deltas: TextDelta[] = yText.toDelta() as TextDelta[];
  const text = yText.toString();
  const widestCharWidth =
    [...text]
      .map(char => getTextWidth(char, font))
      .sort((a, b) => a - b)
      .pop() ?? getTextWidth('W', font);

  if (bound.w < widestCharWidth) {
    bound.w = widestCharWidth;
  }

  const width = bound.w;
  const insertDeltas = deltas.flatMap(delta => ({
    insert: wrapText(delta.insert, font, width),
    attributes: delta.attributes,
  })) as TextDelta[];
  lines = deltaInsertsToChunks(insertDeltas);
  if (!dragging) {
    lines = deltaInsertsToChunks(deltas);
    const widestLineWidth = Math.max(
      ...text.split('\n').map(line => getTextWidth(line, font))
    );
    bound.w = widestLineWidth;
    if (hasMaxWidth && maxWidth && maxWidth > 0) {
      bound.w = Math.min(bound.w, maxWidth);
    }
  }
  bound.h = lineHeightPx * lines.length;

  return bound;
}

export function isFontWeightSupported(
  fontFamily: FontFamily | string,
  weight: FontWeight
) {
  const fontFaces = getFontFacesByFontFamily(fontFamily);
  const fontFace = fontFaces.find(fontFace => fontFace.weight === weight);
  return !!fontFace;
}

export function isFontStyleSupported(
  fontFamily: FontFamily | string,
  style: FontStyle
) {
  const fontFaces = getFontFacesByFontFamily(fontFamily);
  const fontFace = fontFaces.find(fontFace => fontFace.style === style);
  return !!fontFace;
}

export function normalizeText(text: string): string {
  return (
    text
      // replace tabs with spaces so they render and measure correctly
      .replace(/\t/g, '        ')
      // normalize newlines
      .replace(/\r?\n|\r/g, '\n')
  );
}

export const getTextHeight = (text: string, lineHeight: number) => {
  const lineCount = splitIntoLines(text).length;
  return lineHeight * lineCount;
};

export function parseTokens(text: string): string[] {
  // Splitting words containing "-" as those are treated as separate words
  // by css wrapping algorithm eg non-profit => non-, profit
  const words = text.split('-');
  if (words.length > 1) {
    // non-proft org => ['non-', 'profit org']
    words.forEach((word, index) => {
      if (index !== words.length - 1) {
        words[index] = word += '-';
      }
    });
  }
  // Joining the words with space and splitting them again with space to get the
  // final list of tokens
  // ['non-', 'profit org'] =>,'non- profit org' => ['non-','profit','org']
  return words.join(' ').split(' ');
}

export const charWidth = (() => {
  const cachedCharWidth = new Map<string, Array<number>>();

  const calculate = (char: string, font: string) => {
    const ascii = char.charCodeAt(0);

    let fontCache = cachedCharWidth.get(font);
    if (!fontCache) {
      fontCache = [];
      cachedCharWidth.set(font, fontCache);
    }

    if (fontCache[ascii] === undefined) {
      const width = getLineWidth(char, font);
      fontCache[ascii] = width;
    }

    return fontCache[ascii];
  };

  const getCache = (font: string) => {
    return cachedCharWidth.get(font);
  };
  return {
    calculate,
    getCache,
  };
})();

export function wrapText(text: string, font: string, maxWidth: number): string {
  // if maxWidth is not finite or NaN which can happen in case of bugs in
  // computation, we need to make sure we don't continue as we'll end up
  // in an infinite loop
  if (!Number.isFinite(maxWidth) || maxWidth < 0) {
    return text;
  }

  const lines: Array<string> = [];
  const originalLines = text.split('\n');
  const spaceWidth = getLineWidth(' ', font);

  let currentLine = '';
  let currentLineWidthTillNow = 0;

  const push = (str: string) => {
    if (str.trim()) {
      lines.push(str);
    }
  };

  const resetParams = () => {
    currentLine = '';
    currentLineWidthTillNow = 0;
  };
  originalLines.forEach(originalLine => {
    const currentLineWidth = getTextWidth(originalLine, font);

    // Push the line if its <= maxWidth
    if (currentLineWidth <= maxWidth) {
      lines.push(originalLine);
      return; // continue
    }

    const words = parseTokens(originalLine);
    resetParams();

    let index = 0;

    while (index < words.length) {
      const currentWordWidth = getLineWidth(words[index], font);

      // This will only happen when single word takes entire width
      if (currentWordWidth === maxWidth) {
        push(words[index]);
        index++;
      }

      // Start breaking longer words exceeding max width
      else if (currentWordWidth > maxWidth) {
        // push current line since the current word exceeds the max width
        // so will be appended in next line

        push(currentLine);

        resetParams();

        while (words[index].length > 0) {
          const currentChar = String.fromCodePoint(
            words[index].codePointAt(0)!
          );
          const width = charWidth.calculate(currentChar, font);
          currentLineWidthTillNow += width;
          words[index] = words[index].slice(currentChar.length);

          if (currentLineWidthTillNow >= maxWidth) {
            push(currentLine);
            currentLine = currentChar;
            currentLineWidthTillNow = width;
          } else {
            currentLine += currentChar;
          }
        }
        // push current line if appending space exceeds max width
        if (currentLineWidthTillNow + spaceWidth >= maxWidth) {
          push(currentLine);
          resetParams();
          // space needs to be appended before next word
          // as currentLine contains chars which couldn't be appended
          // to previous line unless the line ends with hyphen to sync
          // with css word-wrap
        } else if (!currentLine.endsWith('-')) {
          currentLine += ' ';
          currentLineWidthTillNow += spaceWidth;
        }
        index++;
      } else {
        // Start appending words in a line till max width reached
        while (currentLineWidthTillNow < maxWidth && index < words.length) {
          const word = words[index];
          currentLineWidthTillNow = getLineWidth(currentLine + word, font);

          if (currentLineWidthTillNow > maxWidth) {
            push(currentLine);
            resetParams();

            break;
          }
          index++;

          // if word ends with "-" then we don't need to add space
          // to sync with css word-wrap
          const shouldAppendSpace = !word.endsWith('-');
          currentLine += word;

          if (shouldAppendSpace) {
            currentLine += ' ';
          }

          // Push the word if appending space exceeds max width
          if (currentLineWidthTillNow + spaceWidth >= maxWidth) {
            if (shouldAppendSpace) {
              lines.push(currentLine.slice(0, -1));
            } else {
              lines.push(currentLine);
            }
            resetParams();
            break;
          }
        }
      }
    }
    if (currentLine.slice(-1) === ' ') {
      // only remove last trailing space which we have added when joining words
      currentLine = currentLine.slice(0, -1);
      push(currentLine);
    }
  });
  return lines.join('\n');
}
