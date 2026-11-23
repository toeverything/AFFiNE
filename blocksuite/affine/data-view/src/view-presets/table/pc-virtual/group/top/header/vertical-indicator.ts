import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import { startDrag } from '../../../../../../core/utils/drag';
import { getResultInRange } from '../../../../../../core/utils/utils';
import type { TableProperty } from '../../../../table-view-manager';

export class TableVerticalIndicator extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    data-view-virtual-table-vertical-indicator {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 1;
      pointer-events: none;
    }

    .vertical-indicator {
      position: absolute;
      pointer-events: none;
      width: 1px;
      background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }

    .vertical-indicator::after {
      position: absolute;
      z-index: 1;
      width: 2px;
      height: 100%;
      content: '';
      right: 0;
      background-color: var(--affine-primary-color);
      border-radius: 1px;
    }

    .with-shadow.vertical-indicator::after {
      box-shadow: 0px 0px 8px 0px rgba(30, 150, 235, 0.35);
    }
  `;

  protected override render(): unknown {
    const style = styleMap({
      top: `${this.top}px`,
      left: `${this.left}px`,
      height: `${this.height}px`,
      width: `${this.width}px`,
    });
    const className = classMap({
      'with-shadow': this.shadow,
      'vertical-indicator': true,
    });
    return html` <div class="${className}" style=${style}></div> `;
  }

  @property({ attribute: false })
  accessor height!: number;

  @property({ attribute: false })
  accessor left!: number;

  @property({ attribute: false })
  accessor shadow = false;

  @property({ attribute: false })
  accessor top!: number;

  @property({ attribute: false })
  accessor width!: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-virtual-table-vertical-indicator': TableVerticalIndicator;
  }
}

export const getTableGroupRect = (ele: HTMLElement) => {
  const group = ele.closest('affine-data-view-virtual-table-group');
  if (!group) {
    return;
  }
  const groupRect = group?.getBoundingClientRect();
  const top =
    group
      .querySelector('.affine-database-column-header')
      ?.getBoundingClientRect().top ?? groupRect.top;
  const bottom =
    group.querySelector('.affine-database-block-rows')?.getBoundingClientRect()
      .bottom ?? groupRect.bottom;
  return {
    top: top,
    bottom: bottom,
  };
};
export const startDragWidthAdjustmentBar = (
  evt: PointerEvent,
  ele: HTMLElement,
  width: number,
  column: TableProperty
) => {
  const scale = width / column.width$.value;
  const left = ele.getBoundingClientRect().left;
  const rect = getTableGroupRect(ele);
  if (!rect) {
    return;
  }
  const preview = getVerticalIndicator();
  preview.display(left, rect.top, rect.bottom - rect.top, width * scale);
  startDrag<{ width: number }>(evt, {
    onDrag: () => ({ width: column.width$.value }),
    onMove: ({ x }) => {
      const width = Math.round(
        getResultInRange((x - left) / scale, column.minWidth, Infinity)
      );
      preview.display(left, rect.top, rect.bottom - rect.top, width * scale);
      return {
        width,
      };
    },
    onDrop: ({ width }) => {
      column.updateWidth(width);
    },
    onClear: () => {
      preview.remove();
    },
  });
};
let preview: VerticalIndicator | null = null;
type VerticalIndicator = {
  display: (
    left: number,
    top: number,
    height: number,
    width?: number,
    shadow?: boolean
  ) => void;
  remove: () => void;
};
export const getVerticalIndicator = (): VerticalIndicator => {
  if (!preview) {
    const dragBar = new TableVerticalIndicator();
    preview = {
      display(
        left: number,
        top: number,
        height: number,
        width = 1,
        shadow = false
      ) {
        document.body.append(dragBar);
        dragBar.left = left;
        dragBar.height = height;
        dragBar.top = top;
        dragBar.width = width;
        dragBar.shadow = shadow;
      },
      remove() {
        dragBar.remove();
      },
    };
  }

  return preview;
};
