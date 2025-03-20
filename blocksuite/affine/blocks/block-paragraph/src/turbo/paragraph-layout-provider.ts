import type { Rect } from '@blocksuite/affine-gfx-turbo-renderer';
import {
  BlockLayoutHandlerExtension,
  BlockLayoutHandlersIdentifier,
  getSentenceRects,
  segmentSentences,
} from '@blocksuite/affine-gfx-turbo-renderer';
import type { GfxBlockComponent } from '@blocksuite/block-std';
import { clientToModelCoord } from '@blocksuite/block-std/gfx';
import type { Container } from '@blocksuite/global/di';

import type { ParagraphLayout } from './paragraph-painter.worker';

export class ParagraphLayoutHandlerExtension extends BlockLayoutHandlerExtension<ParagraphLayout> {
  readonly blockType = 'affine:paragraph';

  static override setup(di: Container) {
    const layoutHandler = new ParagraphLayoutHandlerExtension();
    di.addImpl(BlockLayoutHandlersIdentifier, layoutHandler);
  }

  queryLayout(component: GfxBlockComponent): ParagraphLayout | null {
    const paragraphSelector =
      '.affine-paragraph-rich-text-wrapper [data-v-text="true"]';
    const paragraphNodes = component.querySelectorAll(paragraphSelector);

    if (paragraphNodes.length === 0) return null;

    const viewportRecord = component.gfx.viewport.deserializeRecord(
      component.dataset.viewportState
    );

    if (!viewportRecord) return null;

    const { zoom, viewScale } = viewportRecord;
    const paragraph: ParagraphLayout = {
      type: 'affine:paragraph',
      sentences: [],
    };

    paragraphNodes.forEach(paragraphNode => {
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
    });

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
