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

interface ListItemLayout {
  text: string;
  rects: TextRect[];
  fontSize: number;
  type: 'bulleted' | 'numbered' | 'todo' | 'toggle';
  prefix?: string;
  checked?: boolean;
  collapsed?: boolean;
}

export interface ListLayout extends BlockLayout {
  type: 'affine:list';
  items: ListItemLayout[];
}

const debugListBorder = false;

function isListLayout(layout: BlockLayout): layout is ListLayout {
  return layout.type === 'affine:list';
}

class ListLayoutPainter implements BlockLayoutPainter {
  private static readonly supportFontFace =
    typeof FontFace !== 'undefined' &&
    typeof self !== 'undefined' &&
    'fonts' in self;

  static readonly font = ListLayoutPainter.supportFontFace
    ? new FontFace(
        'Inter',
        `url(https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwYZ8UA3.woff2)`
      )
    : null;

  static fontLoaded = !ListLayoutPainter.supportFontFace;

  static {
    if (ListLayoutPainter.supportFontFace && ListLayoutPainter.font) {
      // @ts-expect-error worker fonts API
      self.fonts.add(ListLayoutPainter.font);

      ListLayoutPainter.font
        .load()
        .then(() => {
          ListLayoutPainter.fontLoaded = true;
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
    if (!ListLayoutPainter.fontLoaded) {
      const message: WorkerToHostMessage = {
        type: 'paintError',
        error: 'Font not loaded',
        blockType: 'affine:list',
      };
      self.postMessage(message);
      return;
    }

    if (!isListLayout(layout)) {
      console.warn(
        'Expected list layout but received different format:',
        layout
      );
      return;
    }

    const renderedPositions = new Set<string>();
    layout.items.forEach(item => {
      const fontSize = item.fontSize;
      const baselineY = getBaseline(fontSize);

      ctx.font = `${fontSize}px Inter`;
      ctx.strokeStyle = 'yellow';
      // Render the text content
      item.rects.forEach(textRect => {
        const x = textRect.rect.x - layoutBaseX;
        const y = textRect.rect.y - layoutBaseY;

        const posKey = `${x},${y}`;
        // Only render if we haven't rendered at this position before
        if (renderedPositions.has(posKey)) return;

        if (debugListBorder) {
          ctx.strokeRect(x, y, textRect.rect.w, textRect.rect.h);
        }
        ctx.fillStyle = 'black';
        ctx.fillText(textRect.text, x, y + baselineY);

        renderedPositions.add(posKey);
      });
    });
  }
}

export const ListLayoutPainterExtension = BlockLayoutPainterExtension(
  'affine:list',
  ListLayoutPainter
);
