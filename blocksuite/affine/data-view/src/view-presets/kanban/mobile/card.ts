import { popupTargetFromElement } from '@blocksuite/affine-components/context-menu';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { CenterPeekIcon, MoreHorizontalIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, unsafeCSS } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { html } from 'lit/static-html.js';

import type { KanbanColumn } from '../kanban-view-manager.js';
import type { MobileKanbanViewUILogic } from './kanban-view-ui-logic.js';
import { popCardMenu } from './menu.js';

const styles = css`
  mobile-kanban-card {
    display: flex;
    position: relative;
    flex-direction: column;
    border: 0.5px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
    box-shadow: 0px 2px 3px 0px rgba(0, 0, 0, 0.05);
    border-radius: 8px;
    background-color: var(--affine-background-kanban-card-color);
  }

  .mobile-card-header {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mobile-card-header-title uni-lit {
    width: 100%;
  }

  .mobile-card-header.has-divider {
    border-bottom: 0.5px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
  }

  .mobile-card-header-title {
    font-size: var(--data-view-cell-text-size);
    line-height: var(--data-view-cell-text-line-height);
  }

  .mobile-card-header-icon {
    padding: 4px;
    background-color: var(--affine-background-secondary-color);
    display: flex;
    align-items: center;
    border-radius: 4px;
    width: max-content;
    font-size: 16px;
    color: ${unsafeCSSVarV2('icon/primary')};
  }

  .mobile-card-body {
    display: flex;
    flex-direction: column;
    padding: 8px;
    gap: 4px;
  }

  mobile-kanban-card:has([data-editing='true']) .card-ops {
    visibility: hidden;
  }

  .mobile-card-ops {
    position: absolute;
    right: 8px;
    top: 8px;
    display: flex;
    gap: 4px;
  }

  .mobile-card-op {
    display: flex;
    position: relative;
    padding: 4px;
    border-radius: 4px;
    box-shadow: 0px 0px 4px 0px rgba(66, 65, 73, 0.14);
    background-color: var(--affine-background-primary-color);
    font-size: 16px;
    color: ${unsafeCSSVarV2('icon/primary')};
  }
`;

export class MobileKanbanCard extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private readonly clickCenterPeek = (e: MouseEvent) => {
    e.stopPropagation();
    this.kanbanViewLogic.root.openDetailPanel({
      view: this.view,
      rowId: this.cardId,
    });
  };

  private readonly clickMore = (e: MouseEvent) => {
    e.stopPropagation();
    popCardMenu(
      popupTargetFromElement(e.currentTarget as HTMLElement),
      this.groupKey,
      this.cardId,
      this.kanbanViewLogic
    );
  };

  private renderBody(columns: KanbanColumn[]) {
    if (columns.length === 0) {
      return '';
    }
    return html` <div class="mobile-card-body">
      ${repeat(
        columns,
        v => v.id,
        column => {
          if (this.view.isInHeader(column.id)) {
            return '';
          }
          return html` <mobile-kanban-cell
            .contentOnly="${false}"
            data-column-id="${column.id}"
            .groupKey="${this.groupKey}"
            .column="${column}"
            .cardId="${this.cardId}"
            .kanbanViewLogic="${this.kanbanViewLogic}"
          ></mobile-kanban-cell>`;
        }
      )}
    </div>`;
  }

  private renderHeader(columns: KanbanColumn[]) {
    if (!this.view.hasHeader(this.cardId)) {
      return '';
    }
    const classList = classMap({
      'mobile-card-header': true,
      'mobile-has-divider': columns.length > 0,
    });
    return html`
      <div class="${classList}">${this.renderTitle()} ${this.renderIcon()}</div>
    `;
  }

  private renderIcon() {
    const icon = this.view.getHeaderIcon(this.cardId);
    if (!icon) {
      return;
    }
    return html` <div class="mobile-card-header-icon">
      ${icon.cellGetOrCreate(this.cardId).value$.value}
    </div>`;
  }

  private renderOps() {
    if (this.view.readonly$.value) {
      return;
    }
    return html`
      <div class="mobile-card-ops">
        <div class="mobile-card-op" @click="${this.clickCenterPeek}">
          ${CenterPeekIcon()}
        </div>
        <div class="mobile-card-op" @click="${this.clickMore}">
          ${MoreHorizontalIcon()}
        </div>
      </div>
    `;
  }

  private renderTitle() {
    const title = this.view.getHeaderTitle(this.cardId);
    if (!title) {
      return;
    }
    return html` <div class="mobile-card-header-title">
      <mobile-kanban-cell
        .contentOnly="${true}"
        data-column-id="${title.id}"
        .groupKey="${this.groupKey}"
        .column="${title}"
        .cardId="${this.cardId}"
        .kanbanViewLogic="${this.kanbanViewLogic}"
      ></mobile-kanban-cell>
    </div>`;
  }

  override render() {
    const columns = this.view.properties$.value.filter(
      v => !this.view.isInHeader(v.id)
    );
    return html`
      ${this.renderHeader(columns)} ${this.renderBody(columns)}
      ${this.renderOps()}
    `;
  }

  @property({ attribute: false })
  accessor cardId!: string;

  @property({ attribute: false })
  accessor groupKey!: string;

  @state()
  accessor isFocus = false;

  @property({ attribute: false })
  accessor kanbanViewLogic!: MobileKanbanViewUILogic;

  get view() {
    return this.kanbanViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-kanban-card': MobileKanbanCard;
  }
}
