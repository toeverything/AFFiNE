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

import type { ListLayout } from './list-painter.worker';

export class ListLayoutHandlerExtension extends BlockLayoutHandlerExtension<ListLayout> {
  readonly blockType = 'affine:list';

  static override setup(di: Container) {
    di.addImpl(
      BlockLayoutHandlersIdentifier('list'),
      ListLayoutHandlerExtension
    );
  }

  override queryLayout(
    model: BlockModel,
    host: EditorHost,
    viewportRecord: ViewportRecord
  ): ListLayout | null {
    const component = host.std.view.getBlock(
      model.id
    ) as GfxBlockComponent | null;
    if (!component) return null;

    // Find the list items within this specific list component
    const listItemSelector =
      '.affine-list-block-container .affine-list-rich-text-wrapper [data-v-text="true"]';
    const listItemNodes = component.querySelectorAll(listItemSelector);

    if (listItemNodes.length === 0) return null;

    const { zoom, viewScale } = viewportRecord;
    const list: ListLayout = {
      type: 'affine:list',
      items: [],
      blockId: model.id,
      rect: { x: 0, y: 0, w: 0, h: 0 },
    };

    listItemNodes.forEach(listItemNode => {
      const listItemWrapper = listItemNode.closest(
        '.affine-list-rich-text-wrapper'
      );
      if (!listItemWrapper) return;

      // Determine list item type based on class
      let itemType: 'bulleted' | 'numbered' | 'todo' | 'toggle' = 'bulleted';
      let checked = false;
      let collapsed = false;
      let prefix = '';

      if (listItemWrapper.classList.contains('affine-list--checked')) {
        checked = true;
      }

      const parentListBlock = listItemWrapper.closest(
        '.affine-list-block-container'
      )?.parentElement;
      if (parentListBlock) {
        if (parentListBlock.dataset.listType === 'numbered') {
          itemType = 'numbered';
          const orderVal = parentListBlock.dataset.listOrder;
          if (orderVal) {
            prefix = orderVal + '.';
          }
        } else if (parentListBlock.dataset.listType === 'todo') {
          itemType = 'todo';
        } else if (parentListBlock.dataset.listType === 'toggle') {
          itemType = 'toggle';
          collapsed = parentListBlock.dataset.collapsed === 'true';
        } else {
          itemType = 'bulleted';
        }
      }

      const computedStyle = window.getComputedStyle(listItemNode);
      const fontSizeStr = computedStyle.fontSize;
      const fontSize = parseInt(fontSizeStr);

      const sentences = segmentSentences(listItemNode.textContent || '');
      const sentenceLayouts = sentences.map(sentence => {
        const sentenceRects = getSentenceRects(listItemNode, sentence);
        return {
          text: sentence,
          rects: sentenceRects.map(({ text, rect }) => {
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
          }),
          fontSize,
          type: itemType,
          prefix,
          checked,
          collapsed,
        };
      });

      list.items.push(...sentenceLayouts);
    });

    return list;
  }

  calculateBound(layout: ListLayout) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    layout.items.forEach(item => {
      item.rects.forEach(r => {
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
      subRects: layout.items.flatMap(s => s.rects.map(r => r.rect)),
    };
  }
}
