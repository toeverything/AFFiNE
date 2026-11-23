import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, effect, signal } from '@preact/signals-core';
import { css } from 'lit';
import { property } from 'lit/decorators.js';

import {
  type CellRenderProps,
  type DataViewCellLifeCycle,
  renderUniLit,
} from '../../../core/index.js';
import { TableViewAreaSelection } from '../selection';
import type { TableProperty } from '../table-view-manager.js';
import type { MobileTableViewUILogic } from './table-view-ui-logic.js';

export class MobileTableCell extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    mobile-table-cell {
      display: flex;
      align-items: start;
      width: 100%;
      height: 100%;
      border: none;
      outline: none;
    }

    mobile-table-cell * {
      box-sizing: border-box;
    }

    mobile-table-cell uni-lit > *:first-child {
      padding: 6px;
    }
  `;

  private readonly _cell = signal<DataViewCellLifeCycle>();

  @property({ attribute: false })
  accessor column!: TableProperty;

  @property({ attribute: false })
  accessor rowId!: string;

  cell$ = computed(() => {
    return this.column.cellGetOrCreate(this.rowId);
  });

  isSelectionEditing$ = computed(() => {
    const selection = this.tableViewLogic.selection$.value;
    if (selection?.selectionType !== 'area') {
      return false;
    }
    if (selection.groupKey !== this.groupKey) {
      return false;
    }
    if (selection.focus.columnIndex !== this.columnIndex) {
      return false;
    }
    if (selection.focus.rowIndex !== this.rowIndex) {
      return false;
    }
    return selection.isEditing;
  });

  selectCurrentCell = (editing: boolean) => {
    if (this.view.readonly$.value) {
      return;
    }
    const setSelection = this.tableViewLogic.setSelection.bind(
      this.tableViewLogic
    );
    const viewId = this.tableViewLogic.view.id;
    if (setSelection && viewId) {
      if (editing && this.cell?.beforeEnterEditMode() === false) {
        return;
      }
      setSelection({
        viewId,
        type: 'table',
        ...TableViewAreaSelection.create({
          groupKey: this.groupKey,
          focus: {
            rowIndex: this.rowIndex,
            columnIndex: this.columnIndex,
          },
          isEditing: editing,
        }),
      });
    }
  };

  get cell(): DataViewCellLifeCycle | undefined {
    return this._cell.value;
  }

  private get groupKey() {
    return this.closest('mobile-table-group')?.group?.key;
  }

  override connectedCallback() {
    super.connectedCallback();
    if (this.column.readonly$.value) return;
    this.disposables.add(
      effect(() => {
        const isEditing = this.isSelectionEditing$.value;
        if (isEditing && !this.isEditing$.peek()) {
          this.isEditing$.value = true;
          const cell = this._cell.value;
          requestAnimationFrame(() => {
            cell?.afterEnterEditingMode();
          });
        } else if (!isEditing && this.isEditing$.peek()) {
          this._cell.value?.beforeExitEditingMode();
          this.isEditing$.value = false;
        }
      })
    );
    this.disposables.addFromEvent(this, 'click', () => {
      if (!this.isEditing$.value) {
        this.selectCurrentCell(!this.column.readonly$.value);
      }
    });
  }

  override render() {
    const renderer = this.column.renderer$.value;
    if (!renderer) {
      return;
    }
    const { view } = renderer;
    this.view.lockRows(this.isEditing$.value);
    this.dataset['editing'] = `${this.isEditing$.value}`;
    const props: CellRenderProps = {
      cell: this.cell$.value,
      isEditing$: this.isEditing$,
      selectCurrentCell: this.selectCurrentCell,
    };

    return renderUniLit(view, props, {
      ref: this._cell,
      style: {
        display: 'contents',
      },
    });
  }

  @property({ attribute: false })
  accessor columnId!: string;

  @property({ attribute: false })
  accessor columnIndex!: number;

  isEditing$ = signal(false);

  @property({ attribute: false })
  accessor rowIndex!: number;

  @property({ attribute: false })
  accessor tableViewLogic!: MobileTableViewUILogic;

  get view() {
    return this.tableViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-table-cell': MobileTableCell;
  }
}
