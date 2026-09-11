import { I18n } from '@affine/i18n';
import { html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { BoardColumnPreview } from './column-snapshot';
import type { BoardLodLevel } from './live-budget';
import { sliceCards, sliceWindow, type VirtualWindow } from './virtualize';

export function renderBoardLod(options: {
  columns: BoardColumnPreview[];
  level: Exclude<BoardLodLevel, 'l2'>;
  columnWindow?: VirtualWindow;
}) {
  const columns = options.columnWindow
    ? sliceWindow(options.columns, options.columnWindow)
    : options.columns;
  const spacerBefore = options.columnWindow?.offset ?? 0;
  const spacerAfter = options.columnWindow?.tail ?? 0;

  return html`
    <div class="wb-board__lod wb-board__lod--${options.level}">
      ${spacerBefore
        ? html`<div
            class="wb-board__lod-spacer"
            style=${styleMap({ width: `${spacerBefore}px` })}
          ></div>`
        : nothing}
      ${repeat(
        columns,
        column => column.id,
        column => renderColumn(column, options.level)
      )}
      ${spacerAfter
        ? html`<div
            class="wb-board__lod-spacer"
            style=${styleMap({ width: `${spacerAfter}px` })}
          ></div>`
        : nothing}
    </div>
  `;
}

function renderColumn(
  column: BoardColumnPreview,
  level: Exclude<BoardLodLevel, 'l2'>
) {
  const name =
    column.name || I18n['com.affine.whiteboard.board.ungrouped']();
  const { visible, overflow } = sliceCards(column.cards, level);

  return html`
    <div
      class="wb-board__column"
      style=${styleMap({ '--wb-board-column-color': column.color })}
    >
      <div class="wb-board__column-head">
        <span class="wb-board__column-swatch"></span>
        <span class="wb-board__column-name">${name}</span>
        <span class="wb-board__column-count">${column.count}</span>
      </div>
      ${level === 'l1'
        ? html`
            <div class="wb-board__column-cards">
              ${repeat(
                visible,
                card => card.id,
                card => html`
                  <div class="wb-board__card">${card.title || name}</div>
                `
              )}
              ${overflow
                ? html`<div class="wb-board__more">
                    ${I18n['com.affine.whiteboard.board.more-cards']({
                      count: String(overflow),
                    })}
                  </div>`
                : nothing}
            </div>
          `
        : nothing}
    </div>
  `;
}

export function boardLodKicker(level: BoardLodLevel, preview: boolean) {
  if (preview) {
    return I18n['com.affine.whiteboard.board.preview-label']();
  }
  if (level === 'l0') {
    return I18n['com.affine.whiteboard.board.lod-l0']();
  }
  if (level === 'l1') {
    return I18n['com.affine.whiteboard.board.lod-l1']();
  }
  return I18n['com.affine.whiteboard.board.kicker']();
}
