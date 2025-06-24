// related component

import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { signal } from '@preact/signals-core';
import { css } from 'lit';
import { property } from 'lit/decorators.js';
import { html } from 'lit/static-html.js';

import type {
  CellRenderProps,
  DataViewCellLifeCycle,
} from '../../../core/property/index.js';
import { renderUniLit } from '../../../core/utils/uni-component/uni-component.js';
import type { Property } from '../../../core/view-manager/property.js';
import type { KanbanViewSelection } from '../selection';
import type { KanbanViewUILogic } from './kanban-view-ui-logic.js';

const styles = css`
  affine-data-view-kanban-cell {
    border-radius: 4px;
    display: flex;
    align-items: center;
    padding: 4px;
    min-height: 20px;
    border: 1px solid transparent;
    box-sizing: border-box;
  }

  affine-data-view-kanban-cell:hover {
    background-color: var(--affine-hover-color);
  }

  affine-data-view-kanban-cell .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: start;
    margin-right: 12px;
    height: var(--data-view-cell-text-line-height);
  }

  affine-data-view-kanban-cell .icon svg {
    width: 16px;
    height: 16px;
    fill: var(--affine-icon-color);
    color: var(--affine-icon-color);
  }

  .kanban-cell {
    flex: 1;
    display: block;
    width: 196px;
  }
`;

export class KanbanCell extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private readonly _cell = signal<DataViewCellLifeCycle>();

  selectCurrentCell = (editing: boolean) => {
    const selectionView = this.kanbanViewLogic.selectionController;
    if (selectionView) {
      const selection = selectionView.selection;
      if (selection && this.isSelected(selection) && editing) {
        selectionView.selection = {
          selectionType: 'cell',
          groupKey: this.groupKey,
          cardId: this.cardId,
          columnId: this.column.id,
          isEditing: true,
        };
      } else {
        selectionView.selection = {
          selectionType: 'cell',
          groupKey: this.groupKey,
          cardId: this.cardId,
          columnId: this.column.id,
          isEditing: false,
        };
      }
    }
  };

  get cell(): DataViewCellLifeCycle | undefined {
    return this._cell.value;
  }

  get selection() {
    return this.kanbanViewLogic.selectionController;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._disposables.addFromEvent(this, 'click', e => {
      if (e.shiftKey) {
        return;
      }
      e.stopPropagation();
      const selectionElement = this.kanbanViewLogic.selectionController;
      if (!selectionElement) return;
      if (e.shiftKey) return;

      if (!this.isEditing$.value) {
        this.selectCurrentCell(!this.column.readonly$.value);
      }
    });
  }

  isSelected(selection: KanbanViewSelection) {
    if (
      selection.selectionType !== 'cell' ||
      selection.groupKey !== this.groupKey
    ) {
      return;
    }
    return (
      selection.cardId === this.cardId && selection.columnId === this.column.id
    );
  }

  override render() {
    const props: CellRenderProps = {
      cell: this.column.cellGetOrCreate(this.cardId),
      isEditing$: this.isEditing$,
      selectCurrentCell: this.selectCurrentCell,
    };
    const renderer = this.column.renderer$.value;
    if (!renderer) return;
    const { view } = renderer;
    this.view.lockRows(this.isEditing$.value);
    this.dataset['editing'] = `${this.isEditing$.value}`;
    this.style.border = this.isFocus$.value
      ? '1px solid var(--affine-primary-color)'
      : '';
    this.style.boxShadow = this.isEditing$.value
      ? '0px 0px 0px 2px rgba(30, 150, 235, 0.30)'
      : '';
    return html` ${this.renderIcon()}
    ${renderUniLit(view, props, {
      ref: this._cell,
      class: 'kanban-cell',
      style: { display: 'block', flex: '1', overflow: 'hidden' },
    })}`;
  }

  renderIcon() {
    if (this.contentOnly) {
      return;
    }
    return html` <uni-lit class="icon" .uni="${this.column.icon}"></uni-lit>`;
  }

  @property({ attribute: false })
  accessor cardId!: string;

  @property({ attribute: false })
  accessor column!: Property;

  @property({ attribute: false })
  accessor contentOnly = false;

  isEditing$ = signal(false);

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
    'affine-data-view-kanban-cell': KanbanCell;
  }
}
