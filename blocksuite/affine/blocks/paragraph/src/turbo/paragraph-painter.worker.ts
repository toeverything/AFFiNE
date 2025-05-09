import type {
  BlockLayout,
  BlockLayoutPainter,
  TextRect,
  WorkerToHostMessage,
} from '@blocksuite/affine-gfx-turbo-renderer';
import {
  BlockLayoutPainterExtension,
  getBaseline,
} from '@blocksuite/affine-gfx-turbo-renderer/painter';

interface SentenceLayout {
  text: string;
  rects: TextRect[];
  fontSize: number;
}

export interface ParagraphLayout extends BlockLayout {
  type: 'affine:paragraph';
  sentences: SentenceLayout[];
}

const debugSentenceBorder = false;

function isParagraphLayout(layout: BlockLayout): layout is ParagraphLayout {
  return layout.type === 'affine:paragraph';
}

class ParagraphLayoutPainter implements BlockLayoutPainter {
  private static readonly supportFontFace =
    typeof FontFace !== 'undefined' &&
    typeof self !== 'undefined' &&
    'fonts' in self;

  static readonly font = ParagraphLayoutPainter.supportFontFace
    ? new FontFace(
        'Inter',
        `url(https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwYZ8UA3.woff2)`
      )
    : null;

  static fontLoaded = !ParagraphLayoutPainter.supportFontFace;

  static {
    if (ParagraphLayoutPainter.supportFontFace && ParagraphLayoutPainter.font) {
      // @ts-expect-error worker fonts API
      self.fonts.add(ParagraphLayoutPainter.font);

      ParagraphLayoutPainter.font
        .load()
        .then(() => {
          ParagraphLayoutPainter.fontLoaded = true;
        })
        .catch(error => {
          console.error('Failed to load Inter font:', error);
        });
    }
  }

  paint(
    ctx: OffscreenCanvasRenderingContext2D,
    layout: BlockLayout,
    layoutBaseX: number,
    layoutBaseY: number
  ): void {
    if (!ParagraphLayoutPainter.fontLoaded) {
      const message: WorkerToHostMessage = {
        type: 'paintError',
        error: 'Font not loaded',
        blockType: 'affine:paragraph',
      };
      self.postMessage(message);
      return;
    }

    if (!isParagraphLayout(layout)) {
      console.warn(
        'Expected paragraph layout but received different format:',
        layout
      );
      return;
    }

    const renderedPositions = new Set<string>();
    layout.sentences.forEach(sentence => {
      const fontSize = sentence.fontSize;
      const baselineY = getBaseline(fontSize);
      if (fontSize !== 15) return; // TODO: fine-tune for heading font sizes

      ctx.font = `${fontSize}px Inter`;
      ctx.strokeStyle = 'yellow';
      sentence.rects.forEach(textRect => {
        const x = textRect.rect.x - layoutBaseX;
        const y = textRect.rect.y - layoutBaseY;

        const posKey = `${x},${y}`;
        // Only render if we haven't rendered at this position before
        if (renderedPositions.has(posKey)) return;

        if (debugSentenceBorder) {
          ctx.strokeRect(x, y, textRect.rect.w, textRect.rect.h);
        }
        ctx.fillStyle = 'black';
        ctx.fillText(textRect.text, x, y + baselineY);

        renderedPositions.add(posKey);
      });
    });
  }
}

export const ParagraphLayoutPainterExtension = BlockLayoutPainterExtension(
  'affine:paragraph',
  ParagraphLayoutPainter
);
