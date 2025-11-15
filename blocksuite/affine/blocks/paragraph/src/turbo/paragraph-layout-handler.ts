import type { Rect } from '@blocksuite/affine-gfx-turbo-renderer';
import {
  BlockLayoutHandlerExtension,
  BlockLayoutHandlersIdentifier,
  getSentenceRects,
  segmentSentences,
} from '@blocksuite/affine-gfx-turbo-renderer';
import type { Container } from '@blocksuite/global/di';
import type { EditorHost, GfxBlockComponent } from '@blocksuite/std';
import { clientToModelCoord, type ViewportRecord } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

import type { ParagraphLayout } from './paragraph-painter.worker';

export class ParagraphLayoutHandlerExtension extends BlockLayoutHandlerExtension<ParagraphLayout> {
  readonly blockType = 'affine:paragraph';

  static override setup(di: Container) {
    di.addImpl(
      BlockLayoutHandlersIdentifier('paragraph'),
      ParagraphLayoutHandlerExtension
    );
  }

  override queryLayout(
    model: BlockModel,
    host: EditorHost,
    viewportRecord: ViewportRecord
  ): ParagraphLayout | null {
    const component = host.std.view.getBlock(
      model.id
    ) as GfxBlockComponent | null;
    if (!component) return null;
    const paragraphSelector =
      '.affine-paragraph-rich-text-wrapper [data-v-text="true"]';
    const paragraphNode = component.querySelector(paragraphSelector);
    if (!paragraphNode) return null;

    const { zoom, viewScale } = viewportRecord;
    const paragraph: ParagraphLayout = {
      type: 'affine:paragraph',
      sentences: [],
      blockId: model.id,
      rect: { x: 0, y: 0, w: 0, h: 0 },
    };

    const computedStyle = window.getComputedStyle(paragraphNode);
    const fontSizeStr = computedStyle.fontSize;
    const fontSize = parseInt(fontSizeStr);

    const sentences = segmentSentences(paragraphNode.textContent || '');
    const sentenceLayouts = sentences.map(sentence => {
      const sentenceRects = getSentenceRects(paragraphNode, sentence);
      const rects = sentenceRects.map(({ text, rect }) => {
        const [modelX, modelY] = clientToModelCoord(viewportRecord, [
          rect.x,
          rect.y,
        ]);
        return {
          text,
          rect: {
            x: modelX,
            y: modelY,
            w: rect.w / zoom / viewScale,
            h: rect.h / zoom / viewScale,
          },
        };
      });
      return {
        text: sentence,
        rects,
        fontSize,
      };
    });
    paragraph.sentences.push(...sentenceLayouts);
    return paragraph;
  }

  calculateBound(layout: ParagraphLayout) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    layout.sentences.forEach(sentence => {
      sentence.rects.forEach(r => {
        minX = Math.min(minX, r.rect.x);
        minY = Math.min(minY, r.rect.y);
        maxX = Math.max(maxX, r.rect.x + r.rect.w);
        maxY = Math.max(maxY, r.rect.y + r.rect.h);
      });
    });

    const rect: Rect = {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    };

    return {
      rect,
      subRects: layout.sentences.flatMap(s => s.rects.map(r => r.rect)),
    };
  }
}
