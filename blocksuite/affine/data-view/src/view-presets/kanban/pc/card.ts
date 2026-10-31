import { popupTargetFromElement } from '@blocksuite/affine-components/context-menu';
import {
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { CenterPeekIcon, MoreHorizontalIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { signal } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { html } from 'lit/static-html.js';

import { getKanbanParentContext } from '../hierarchy-context.js';
import type { KanbanColumn } from '../kanban-view-manager.js';
import type { KanbanViewUILogic } from './kanban-view-ui-logic.js';
import { openDetail, popCardMenu } from './menu.js';

const styles = css`
  affine-data-view-kanban-card {
    display: flex;
    position: relative;
    flex-direction: column;
    border: 1px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
    box-shadow: 0px 2px 3px 0px rgba(0, 0, 0, 0.05);
    border-radius: 8px;
    transition: background-color 100ms ease-in-out;
    background-color: var(--affine-background-kanban-card-color);
  }

  affine-data-view-kanban-card:hover {
    background-color: var(--affine-hover-color);
  }

  /* Story 2.7 (AC5, extended to kanban view): overdue-and-undone cards —
     mirrors the list/table views' own overdue treatment. */
  affine-data-view-kanban-card[data-overdue='true'] {
    border-color: var(--affine-error-color);
  }
  affine-data-view-kanban-card[data-overdue='true'] .card-header-title {
    color: var(--affine-error-color);
    font-weight: 600;
  }

  affine-data-view-kanban-card .card-header {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  affine-data-view-kanban-card .card-parent-context {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    color: var(--affine-text-secondary-color);
    font-size: 12px;
    line-height: 18px;
  }

  affine-data-view-kanban-card .card-parent-title {
    border: 0;
    padding: 0;
    background: transparent;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  affine-data-view-kanban-card .card-parent-title:hover,
  affine-data-view-kanban-card .card-parent-title:focus-visible {
    color: var(--affine-primary-color);
  }

  affine-data-view-kanban-card .card-parent-level {
    flex: none;
    white-space: nowrap;
  }

  affine-data-view-kanban-card .card-header-title uni-lit {
    width: 100%;
  }

  .card-header.has-divider {
    border-bottom: 0.5px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
  }

  affine-data-view-kanban-card .card-header-title {
    font-size: var(--data-view-cell-text-size);
    line-height: var(--data-view-cell-text-line-height);
  }

  affine-data-view-kanban-card .card-header-icon {
    padding: 4px;
    background-color: var(--affine-background-secondary-color);
    display: flex;
    align-items: center;
    border-radius: 4px;
    width: max-content;
  }

  affine-data-view-kanban-card .card-header-icon svg {
    width: 16px;
    height: 16px;
    fill: var(--affine-icon-color);
    color: var(--affine-icon-color);
  }

  affine-data-view-kanban-card .card-body {
    display: flex;
    flex-direction: column;
    padding: 8px;
    gap: 4px;
  }

  affine-data-view-kanban-card:hover .card-ops {
    visibility: visible;
  }
  affine-data-view-kanban-card:has(.active) .card-ops {
    visibility: visible;
  }

  affine-data-view-kanban-card:has([data-editing='true']) .card-ops {
    visibility: hidden;
  }

  .card-ops {
    position: absolute;
    right: 8px;
    top: 8px;
    visibility: hidden;
    display: flex;
    gap: 4px;
    cursor: pointer;
  }

  .card-op {
    display: flex;
    position: relative;
    padding: 4px;
    border-radius: 4px;
    box-shadow: 0px 0px 4px 0px rgba(66, 65, 73, 0.14);
    background-color: var(--affine-background-primary-color);
  }

  .card-op:hover:before {
    content: '';
    border-radius: 4px;
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    background-color: var(--affine-hover-color);
  }

  .card-op svg {
    fill: var(--affine-icon-color);
    color: var(--affine-icon-color);
    width: 16px;
    height: 16px;
  }
`;

export class KanbanCard extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private readonly clickEdit = (e: MouseEvent) => {
    e.stopPropagation();
    const selection = this.getSelection();
    if (selection) {
      openDetail(this.kanbanViewLogic, this.cardId, selection);
    }
  };

  private readonly clickMore = (e: MouseEvent) => {
    e.stopPropagation();
    const selection = this.getSelection();
    const ele = e.currentTarget as HTMLElement;
    if (selection) {
      selection.selection = {
        selectionType: 'card',
        cards: [
          {
            groupKey: this.groupKey,
            cardId: this.cardId,
          },
        ],
      };
      popCardMenu(
        this.kanbanViewLogic,
        popupTargetFromElement(ele),
        this.cardId,
        selection
      );
    }
  };

  private readonly contextMenu = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const selection = this.getSelection();
    if (selection) {
      selection.selection = {
        selectionType: 'card',
        cards: [
          {
            groupKey: this.groupKey,
            cardId: this.cardId,
          },
        ],
      };
      const target = e.target as HTMLElement;
      const ref = target.closest('affine-data-view-kanban-cell') ?? this;
      popCardMenu(
        this.kanbanViewLogic,
        popupTargetFromElement(ref),
        this.cardId,
        selection
      );
    }
  };

  private getSelection() {
    return this.kanbanViewLogic.selectionController;
  }

  private getParentContext() {
    const docId = (this.view.manager.dataSource as { doc?: { id: string } }).doc
      ?.id;
    if (!docId) {
      return;
    }
    return getKanbanParentContext({
      rowId: this.cardId,
      docId,
      properties: this.view.propertiesRaw$.value,
      rowIds: this.view.rowIds$.value,
    });
  }

  private renderBody(columns: KanbanColumn[]) {
    if (columns.length === 0) {
      return '';
    }
    return html` <div class="card-body">
      ${repeat(
        columns,
        v => v.id,
        column => {
          // These 3 system columns are pure internal bookkeeping (see
          // `ensureTaskHierarchyColumns` — they're forced-hidden from every
          // *view's* own column list too) and must never show on a card,
          // regardless of whether this specific card happens to have a
          // parent (`getKanbanParentContext` only returns a context for
          // non-root cards — a root-level card, with no parent, has no
          // parent context, so gating this filter on `hasParentContext`
          // left them fully visible on every root-level card while
          // correctly hiding them everywhere else).
          if (
            column.name$.value === TASK_PARENT_IDENTIFIER_COLUMN_NAME ||
            column.name$.value === TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME ||
            column.name$.value === TASK_HIERARCHY_LEVEL_COLUMN_NAME
          ) {
            return '';
          }
          if (this.view.isInHeader(column.id)) {
            return '';
          }
          return html` <affine-data-view-kanban-cell
            .contentOnly="${false}"
            data-column-id="${column.id}"
            .groupKey="${this.groupKey}"
            .column="${column}"
            .cardId="${this.cardId}"
            .kanbanViewLogic="${this.kanbanViewLogic}"
          ></affine-data-view-kanban-cell>`;
        }
      )}
    </div>`;
  }

  private renderHeader(columns: KanbanColumn[]) {
    const parentContext = this.getParentContext();
    if (!this.view.hasHeader(this.cardId) && !parentContext) {
      return '';
    }
    const classList = classMap({
      'card-header': true,
      'has-divider': columns.length > 0,
    });
    return html`
      <div class="${classList}">
        ${this.renderParentContext(parentContext)} ${this.renderTitle()}
        ${this.renderIcon()}
      </div>
    `;
  }

  private renderParentContext(
    context: ReturnType<typeof getKanbanParentContext> = this.getParentContext()
  ) {
    if (!context) {
      return;
    }
    const openParent = (event: MouseEvent) => {
      event.stopPropagation();
      const selection = this.getSelection();
      if (!selection) {
        return;
      }
      openDetail(this.kanbanViewLogic, context.parentId, selection);
    };
    return html`<div class="card-parent-context">
      <button
        class="card-parent-title"
        title=${context.parentTitle}
        @click=${openParent}
      >
        Parent: ${context.parentDisplayName}
      </button>
      ${context.level == null
        ? ''
        : html`<span class="card-parent-level">Level: ${context.level}</span>`}
    </div>`;
  }

  private renderIcon() {
    const icon = this.view.getHeaderIcon(this.cardId);
    if (!icon) {
      return;
    }
    return html` <div class="card-header-icon">
      ${icon.cellGetOrCreate(this.cardId).value$.value}
    </div>`;
  }

  private renderOps() {
    if (this.view.readonly$.value) {
      return;
    }
    return html`
      <div class="card-ops">
        <div class="card-op" @click="${this.clickEdit}">
          ${CenterPeekIcon()}
        </div>
        <div class="card-op" @click="${this.clickMore}">
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
    return html` <div class="card-header-title">
      <affine-data-view-kanban-cell
        .contentOnly="${true}"
        data-column-id="${title.id}"
        .kanbanViewLogic="${this.kanbanViewLogic}"
        .groupKey="${this.groupKey}"
        .column="${title}"
        .cardId="${this.cardId}"
      ></affine-data-view-kanban-cell>
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();
    if (this.view.readonly$.value) {
      return;
    }
    this._disposables.addFromEvent(this, 'contextmenu', e => {
      this.contextMenu(e);
    });
    this._disposables.addFromEvent(this, 'click', e => {
      if (e.shiftKey) {
        this.getSelection()?.shiftClickCard(e);
        return;
      }
      const selection = this.getSelection();
      const preSelection = selection?.selection;

      if (preSelection?.selectionType !== 'card') return;

      if (selection) {
        selection.selection = undefined;
      }
      this.kanbanViewLogic.root.openDetailPanel({
        view: this.view,
        rowId: this.cardId,
        onClose: () => {
          if (selection) {
            selection.selection = preSelection;
          }
        },
      });
    });
  }

  override render() {
    const columns = this.view.properties$.value.filter(
      v => !this.view.isInHeader(v.id)
    );
    this.style.border = this.isFocus$.value
      ? '1px solid var(--affine-primary-color)'
      : '';
    return html`
      ${this.renderHeader(columns)} ${this.renderBody(columns)}
      ${this.renderOps()}
    `;
  }

  @property({ attribute: false })
  accessor cardId!: string;

  @property({ attribute: false })
  accessor groupKey!: string;

  isFocus$ = signal(false);

  @property({ attribute: false })
  accessor kanbanViewLogic!: KanbanViewUILogic;

  get view() {
    return this.kanbanViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-kanban-card': KanbanCard;
  }
}
