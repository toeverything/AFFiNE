import { I18n } from '@affine/i18n';
import { html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { BoardColumnPreview } from './column-snapshot';
import type { BoardCardPreview, BoardGrid } from './grid';
import { cardsInColumn } from './grid';
import type { BoardLodLevel } from './live-budget';
import { formatMinutes, isWipExceeded } from './semantics';
import { sliceCards, sliceWindow, type VirtualWindow } from './virtualize';

export type BoardLodHandlers = {
  interactive?: boolean;
  onMove?: (rowId: string, x: string, y: string) => void;
  onOpen?: (rowId: string) => void;
  onComment?: (rowId: string) => void;
  onLogTime?: (rowId: string) => void;
};

export function renderBoardLod(options: {
  columns: BoardColumnPreview[];
  level: Exclude<BoardLodLevel, 'l2'>;
  columnWindow?: VirtualWindow;
  wipLimits?: Record<string, number>;
  handlers?: BoardLodHandlers;
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
        column =>
          renderColumn(
            column,
            options.level,
            options.wipLimits?.[column.id],
            options.handlers
          )
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

export function renderBoardGrid(options: {
  grid: BoardGrid;
  level: Exclude<BoardLodLevel, 'l2'> | 'l2';
  laneFilter?: string;
  handlers?: BoardLodHandlers;
}) {
  const lanes = options.laneFilter
    ? options.grid.lanes.filter(lane => lane.id === options.laneFilter)
    : options.grid.lanes;
  const cardLevel = options.level === 'l2' ? 'l2' : options.level;

  return html`
    <div class="wb-board__grid">
      <div class="wb-board__grid-corner"></div>
      ${repeat(
        options.grid.columns,
        column => column.id,
        column => {
          const count = cardsInColumn(options.grid, column.id);
          const exceeded = isWipExceeded(
            count,
            options.grid.wipLimits[column.id]
          );
          return html`
            <div
              class="wb-board__column-head ${exceeded
                ? 'wb-board__column-head--wip'
                : ''}"
              style=${styleMap({ '--wb-board-column-color': column.color })}
            >
              <span class="wb-board__column-swatch"></span>
              <span class="wb-board__column-name">
                ${column.name || I18n['com.affine.whiteboard.board.ungrouped']()}
              </span>
              <span class="wb-board__column-count"
                >${count}${options.grid.wipLimits[column.id]
                  ? `/${options.grid.wipLimits[column.id]}`
                  : ''}</span
              >
            </div>
          `;
        }
      )}
      ${repeat(lanes, lane => lane.id || 'ungrouped', lane => {
        return html`
          <div class="wb-board__lane-label">
            ${lane.name || I18n['com.affine.whiteboard.board.unassigned']()}
          </div>
          ${repeat(options.grid.columns, column => column.id, column => {
            const cell = options.grid.cells.find(
              item => item.x === column.id && item.y === lane.id
            );
            const { visible, overflow } = sliceCards(
              cell?.cards ?? [],
              cardLevel === 'l2' ? 'l2' : cardLevel
            );
            return html`
              <div
                class="wb-board__cell"
                data-x=${column.id}
                data-y=${lane.id}
                @dragover=${(event: DragEvent) => {
                  if (!options.handlers?.interactive) return;
                  event.preventDefault();
                }}
                @drop=${(event: DragEvent) => {
                  if (!options.handlers?.interactive) return;
                  event.preventDefault();
                  const rowId = event.dataTransfer?.getData('text/wb-card');
                  if (rowId) {
                    options.handlers.onMove?.(rowId, column.id, lane.id);
                  }
                }}
              >
                ${repeat(
                  visible,
                  card => card.id,
                  card => renderCard(card, options.handlers)
                )}
                ${overflow
                  ? html`<div class="wb-board__more">
                      ${I18n['com.affine.whiteboard.board.more-cards']({
                        count: String(overflow),
                      })}
                    </div>`
                  : nothing}
              </div>
            `;
          })}
        `;
      })}
    </div>
  `;
}

function renderColumn(
  column: BoardColumnPreview,
  level: Exclude<BoardLodLevel, 'l2'>,
  wipLimit?: number,
  handlers?: BoardLodHandlers
) {
  const name =
    column.name || I18n['com.affine.whiteboard.board.ungrouped']();
  const { visible, overflow } = sliceCards(column.cards, level);
  const exceeded = isWipExceeded(column.count, wipLimit);

  return html`
    <div
      class="wb-board__column ${exceeded ? 'wb-board__column--wip' : ''}"
      style=${styleMap({ '--wb-board-column-color': column.color })}
    >
      <div class="wb-board__column-head">
        <span class="wb-board__column-swatch"></span>
        <span class="wb-board__column-name">${name}</span>
        <span class="wb-board__column-count"
          >${column.count}${wipLimit ? `/${wipLimit}` : ''}</span
        >
      </div>
      ${level === 'l1'
        ? html`
            <div class="wb-board__column-cards">
              ${repeat(
                visible,
                card => card.id,
                card =>
                  renderCard(
                    { ...card, tasks: [], attachmentCount: 0 },
                    handlers
                  )
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

function renderCard(card: BoardCardPreview, handlers?: BoardLodHandlers) {
  const checklist = card.checklist;
  const time = formatMinutes(card.timeSpent);
  return html`
    <div
      class="wb-board__card ${handlers?.interactive ? 'wb-board__card--live' : ''}"
      draggable=${!!handlers?.interactive}
      @dragstart=${(event: DragEvent) => {
        event.dataTransfer?.setData('text/wb-card', card.id);
      }}
      @click=${() => handlers?.onOpen?.(card.id)}
    >
      <div class="wb-board__card-title">${card.title}</div>
      <div class="wb-board__card-meta">
        ${checklist
          ? html`<span
              >${I18n['com.affine.whiteboard.board.checklist']()}
              ${checklist.done}/${checklist.total}</span
            >`
          : nothing}
        ${time
          ? html`<span
              >${I18n['com.affine.whiteboard.board.time-spent']()} ${time}</span
            >`
          : nothing}
        ${card.attachmentCount
          ? html`<span
              >${I18n['com.affine.whiteboard.board.attachments']()}
              ${card.attachmentCount}</span
            >`
          : nothing}
        ${handlers?.interactive
          ? html`
              <button
                type="button"
                class="wb-board__card-btn"
                @click=${(event: Event) => {
                  event.stopPropagation();
                  handlers.onComment?.(card.id);
                }}
              >
                ${I18n['com.affine.whiteboard.board.comment']()}
              </button>
              <button
                type="button"
                class="wb-board__card-btn"
                @click=${(event: Event) => {
                  event.stopPropagation();
                  handlers.onLogTime?.(card.id);
                }}
              >
                ${I18n['com.affine.whiteboard.board.log-time']()}
              </button>
            `
          : nothing}
      </div>
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
