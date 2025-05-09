import {
  menu,
  popFilterableSimpleMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { AddCursorIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { html } from 'lit/static-html.js';

import type { DataViewRenderer } from '../../../core/data-view.js';
import { GroupTitle } from '../../../core/group-by/group-title.js';
import type { GroupData } from '../../../core/group-by/trait.js';
import { dragHandler } from '../../../core/utils/wc-dnd/dnd-context.js';
import type { KanbanSingleView } from '../kanban-view-manager.js';

const styles = css`
  mobile-kanban-group {
    width: 260px;
    flex-shrink: 0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
  }

  .mobile-group-header {
    height: 32px;
    padding: 6px 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    overflow: hidden;
  }

  .mobile-group-body {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    padding: 0 4px;
    gap: 12px;
  }

  .mobile-add-card {
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
    font-size: var(--data-view-cell-text-size);
    line-height: var(--data-view-cell-text-line-height);
    color: var(--affine-text-secondary-color);
  }
`;

export class MobileKanbanGroup extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private readonly clickAddCard = () => {
    this.view.addCard('end', this.group.key);
  };

  private readonly clickAddCardInStart = () => {
    this.view.addCard('start', this.group.key);
  };

  private readonly clickGroupOptions = (e: MouseEvent) => {
    const ele = e.currentTarget as HTMLElement;
    popFilterableSimpleMenu(popupTargetFromElement(ele), [
      menu.group({
        items: [
          menu.action({
            name: 'Ungroup',
            hide: () => this.group.value == null,
            select: () => {
              this.group.rows.forEach(row => {
                this.group.manager.removeFromGroup(row.rowId, this.group.key);
              });
            },
          }),
          menu.action({
            name: 'Delete Cards',
            select: () => {
              this.view.rowsDelete(this.group.rows.map(row => row.rowId));
            },
          }),
        ],
      }),
    ]);
  };

  override render() {
    const cards = this.group.rows;
    return html`
      <div class="mobile-group-header" ${dragHandler(this.group.key)}>
        ${GroupTitle(this.group, {
          readonly: this.view.readonly$.value,
          clickAdd: this.clickAddCardInStart,
          clickOps: this.clickGroupOptions,
        })}
      </div>
      <div class="mobile-group-body">
        ${repeat(
          cards,
          row => row.rowId,
          row => {
            return html`
              <mobile-kanban-card
                data-card-id="${row.rowId}"
                .groupKey="${this.group.key}"
                .dataViewEle="${this.dataViewEle}"
                .view="${this.view}"
                .cardId="${row.rowId}"
              ></mobile-kanban-card>
            `;
          }
        )}
        ${this.view.readonly$.value
          ? nothing
          : html` <div class="mobile-add-card" @click="${this.clickAddCard}">
              <div
                style="margin-right: 4px;width: 16px;height: 16px;display:flex;align-items:center;"
              >
                ${AddCursorIcon()}
              </div>
              Add
            </div>`}
      </div>
    `;
  }

  @property({ attribute: false })
  accessor dataViewEle!: DataViewRenderer;

  @property({ attribute: false })
  accessor group!: GroupData;

  @property({ attribute: false })
  accessor view!: KanbanSingleView;
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-kanban-group': MobileKanbanGroup;
  }
}
